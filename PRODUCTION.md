# Production Deployment Guide

This guide covers deploying the demand forecasting pipeline to production environments.

## Prerequisites

### Required
- Node.js 20+
- OpenAI API key with GPT-4 access
- PostgreSQL or SQLite for caching (SQLite included by default)

### Recommended
- Web search API key (Tavily, Serper, or Brave)
- Redis for distributed caching (optional, for multi-instance deployments)
- Monitoring/observability platform (Datadog, New Relic, etc.)

## Environment Configuration

### Production Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-proj-...
NODE_ENV=production

# Recommended - Web Search
TAVILY_API_KEY=tvly-...  # Best for medical/scientific queries

# Optional - Alternative search providers
# SERPER_API_KEY=...
# BRAVE_API_KEY=...

# Logging
LOG_LEVEL=info  # Use 'warn' or 'error' in production for less verbosity

# Database (if using external DB)
DATABASE_URL=postgresql://user:pass@host:5432/demandforecast

# Caching
CACHE_TTL_DAYS=30
ENABLE_CACHE=true

# Rate Limiting
MAX_CONCURRENT_LLM_CALLS=5
REQUEST_TIMEOUT_MS=120000

# Monitoring (optional)
SENTRY_DSN=https://...
DATADOG_API_KEY=...
```

## Web Search Integration

The pipeline uses web search to ground LLM outputs with real evidence. Three providers are supported:

### Tavily (Recommended)
```bash
export TAVILY_API_KEY=tvly-...
```
- **Best for**: Medical, scientific, and academic content
- **Pricing**: Pay-as-you-go, $1 per 1000 searches
- **Sign up**: https://tavily.com

### Serper
```bash
export SERPER_API_KEY=...
```
- **Best for**: General web search via Google
- **Pricing**: Free tier available, then pay-as-you-go
- **Sign up**: https://serper.dev

### Brave Search
```bash
export BRAVE_API_KEY=...
```
- **Best for**: Privacy-focused search
- **Pricing**: Free tier available
- **Sign up**: https://brave.com/search/api/

### Fallback Mode
If no search API key is provided, the pipeline falls back to **simulation mode** using domain-relevant placeholder results. This works but provides less accurate evidence grounding.

## Deployment Options

### 1. Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

# Copy source
COPY . .

# Build TypeScript
RUN pnpm build

# Set production environment
ENV NODE_ENV=production

# Run
CMD ["node", "dist/cli/index.js"]
```

Build and run:
```bash
docker build -t demand-forecast .
docker run -e OPENAI_API_KEY=$OPENAI_API_KEY \
           -e TAVILY_API_KEY=$TAVILY_API_KEY \
           -v $(pwd)/runs:/app/runs \
           demand-forecast run \
           --disease "breast cancer" \
           --molecule "trastuzumab"
```

### 2. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demand-forecast
spec:
  replicas: 2
  selector:
    matchLabels:
      app: demand-forecast
  template:
    metadata:
      labels:
        app: demand-forecast
    spec:
      containers:
      - name: forecast
        image: your-registry/demand-forecast:latest
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: openai
        - name: TAVILY_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: tavily
        - name: NODE_ENV
          value: "production"
        volumeMounts:
        - name: cache
          mountPath: /app/llm_cache.db
        - name: runs
          mountPath: /app/runs
      volumes:
      - name: cache
        persistentVolumeClaim:
          claimName: forecast-cache
      - name: runs
        persistentVolumeClaim:
          claimName: forecast-runs
```

### 3. Serverless Deployment (AWS Lambda)

The pipeline can run as a Lambda function for on-demand forecasting:

```javascript
// lambda-handler.js
import { runPipeline } from './dist/pipeline/run.js';

export const handler = async (event) => {
  const { disease, molecule, geo, baseYear, horizonYears } = event;

  const result = await runPipeline({
    disease,
    molecule,
    geo,
    baseYear: parseInt(baseYear),
    horizonYears: parseInt(horizonYears),
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
```

Configure Lambda:
- **Runtime**: Node.js 20
- **Memory**: 2048 MB
- **Timeout**: 15 minutes
- **Environment**: Set OPENAI_API_KEY, TAVILY_API_KEY
- **Storage**: Mount EFS for caching

## Production Best Practices

### 1. Caching Strategy

The pipeline uses SQLite for LLM response caching by default. For production:

**Single Instance**:
- Use SQLite (included) with file-based cache
- Mount persistent volume for `llm_cache.db`

**Multi-Instance**:
- Migrate to Redis or PostgreSQL for shared cache
- Implement distributed locking for cache writes

### 2. Error Handling & Retry Logic

The LLM client includes:
- ✅ Exponential backoff retry (up to 3 attempts)
- ✅ Timeout handling (2 minutes default)
- ✅ Rate limit detection and backoff
- ✅ Graceful degradation (simulated search fallback)

### 3. Monitoring & Observability

Add application monitoring:

```typescript
// Add to src/utils/monitoring.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, { extra: context });
}
```

### 4. Audit & Compliance

All runs generate comprehensive audit logs:
- LLM prompts and responses
- Search queries and results
- Timestamps and token usage
- Confidence scores and citations

Store audit logs in compliance-ready storage:
```bash
# Copy audit logs to S3
aws s3 sync ./runs s3://forecast-audit-logs/ \
  --exclude "*" \
  --include "*/audit_log.json"
```

### 5. Cost Optimization

**LLM API Costs**:
- Enable caching (default: ON)
- Use GPT-4o-mini for non-critical stages
- Batch similar queries when possible

**Search API Costs**:
- Cache search results (included)
- Limit to 5 results per query (default)
- Use simulation mode for dev/test

**Example costs** (breast cancer + trastuzumab):
- OpenAI: ~$1-3 per run (first time, ~$0 after caching)
- Tavily: ~$0.02 per run (10-20 searches)
- **Total**: ~$1-3 first run, ~$0.02 subsequent runs

### 6. Security

**API Keys**:
- Never commit keys to version control
- Use secret management (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly

**Data Protection**:
- Runs may contain PHI - ensure HIPAA compliance if needed
- Encrypt data at rest (runs/, llm_cache.db)
- Implement access controls

**Network Security**:
- Use private VPC for deployment
- Whitelist API endpoints (openai.com, tavily.com)
- Enable TLS for all API calls (default)

## Scaling Considerations

### Horizontal Scaling
- Run multiple instances behind a load balancer
- Use shared cache (Redis/PostgreSQL)
- Distribute runs via message queue (SQS, RabbitMQ)

### Vertical Scaling
- Increase memory for large treatment maps (2-4 GB recommended)
- Use faster CPUs for vial rounding calculations
- SSD storage for SQLite cache

### Performance Optimization
- Pre-warm cache with common molecules
- Parallelize independent LLM calls (future enhancement)
- Use streaming for large CSV exports

## Health Checks

Implement health check endpoint:

```typescript
// src/cli/health.ts
export async function healthCheck() {
  const checks = {
    openai: await checkOpenAI(),
    search: await checkSearch(),
    cache: await checkCache(),
    disk: await checkDiskSpace(),
  };

  const healthy = Object.values(checks).every(c => c.status === 'ok');

  return {
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  };
}
```

## Disaster Recovery

**Backup Strategy**:
1. **Cache**: Backup `llm_cache.db` daily
2. **Runs**: Sync `runs/` to S3/GCS after each run
3. **Assumptions**: Version control `assumptions/` in Git

**Recovery**:
1. Restore cache from backup
2. Restore runs from S3/GCS
3. Replay failed runs using cached LLM responses

## Support & Troubleshooting

### Common Production Issues

**1. Rate Limits**
```
Error: 429 Too Many Requests
```
**Solution**: Increase retry delays, request higher limits from OpenAI

**2. Timeout Errors**
```
Error: Request timeout after 120000ms
```
**Solution**: Increase timeout, use faster model (GPT-4o-mini)

**3. Out of Memory**
```
JavaScript heap out of memory
```
**Solution**: Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`

**4. Search API Failures**
```
Warning: Web search failed, using simulation
```
**Solution**: Check API key, network connectivity, or accept simulation mode

### Monitoring Metrics

Track these metrics in production:
- **Pipeline run time** (target: <5 minutes)
- **LLM token usage** (track costs)
- **Cache hit rate** (target: >80% for repeated queries)
- **Error rate** (target: <1%)
- **Search API latency**

## Additional Resources

- [OpenAI API Docs](https://platform.openai.com/docs)
- [Tavily API Docs](https://docs.tavily.com)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

## License & Compliance

Ensure compliance with:
- OpenAI Terms of Service
- Search provider terms
- Healthcare data regulations (HIPAA, GDPR) if handling PHI
- Clinical claims responsibility (outputs are forecasts, not clinical recommendations)
