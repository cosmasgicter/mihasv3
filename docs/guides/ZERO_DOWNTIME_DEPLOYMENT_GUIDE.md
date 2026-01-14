# Zero-Downtime Deployment Guide

## Overview

The MIHAS Zero-Downtime Deployment System provides robust deployment strategies with feature flag management, ensuring seamless updates without service interruption.

**Requirements**: 10.5

## Features

- ✅ **Feature Flag Management**: Gradual rollouts and A/B testing
- ✅ **Blue-Green Deployments**: Instant traffic switching with rollback
- ✅ **Canary Releases**: Gradual traffic increase with monitoring
- ✅ **Deployment Monitoring**: Real-time progress tracking
- ✅ **Automatic Rollback**: Instant rollback on failure detection
- ✅ **Audit Trail**: Complete deployment history

## Deployment Strategies

### 1. Blue-Green Deployment

Deploy to a parallel environment (green) while the current version (blue) serves traffic. Switch traffic instantly once validated.

**Advantages**:
- Instant rollback capability
- Zero downtime
- Full environment testing before switch

**Use Cases**:
- Major version updates
- Database schema changes
- Critical bug fixes

**Process**:
```
1. Deploy to green environment
2. Run health checks on green
3. Switch traffic from blue to green
4. Monitor green environment
5. Decommission blue environment
```

### 2. Canary Deployment

Gradually increase traffic to the new version while monitoring metrics.

**Advantages**:
- Risk mitigation through gradual rollout
- Real-time metric monitoring
- Easy rollback at any percentage

**Use Cases**:
- New features with unknown impact
- Performance-sensitive changes
- High-risk updates

**Process**:
```
1. Deploy canary version
2. Route 5% traffic to canary
3. Monitor metrics for 5 minutes
4. Increase to 10%, 25%, 50%, 100%
5. Complete rollout or rollback
```

### 3. Rolling Deployment

Update instances one at a time while maintaining service availability.

**Advantages**:
- Resource efficient
- Gradual rollout
- No duplicate infrastructure needed

**Use Cases**:
- Minor updates
- Configuration changes
- Low-risk deployments

## Feature Flag Management

### Creating a Feature Flag

```javascript
import { createFeatureFlagManager } from './functions/_lib/featureFlags.js';

const manager = createFeatureFlagManager(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Create a new feature flag
await manager.setFlag({
  key: 'new_dashboard',
  name: 'New Dashboard UI',
  description: 'Redesigned admin dashboard with improved UX',
  status: 'disabled',
  targeting_strategy: 'percentage',
  rollout_percentage: 0
});
```

### Checking Feature Flags

```javascript
// Check if feature is enabled for a user
const isEnabled = await manager.isEnabled('new_dashboard', {
  userId: 'user-123',
  attributes: {
    role: 'admin',
    beta_tester: true
  }
});

if (isEnabled) {
  // Show new dashboard
} else {
  // Show old dashboard
}
```

### Gradual Rollout

```javascript
// Enable for 10% of users
await manager.enableFlag('new_dashboard', 10);

// Gradually increase to 25%
await manager.gradualRollout('new_dashboard', 25, 15);

// Enable for all users
await manager.enableFlag('new_dashboard', 100);
```

### Targeting Strategies

#### 1. All Users
```javascript
{
  targeting_strategy: 'all_users',
  status: 'enabled'
}
```

#### 2. Percentage-Based
```javascript
{
  targeting_strategy: 'percentage',
  rollout_percentage: 25
}
```

#### 3. User List
```javascript
{
  targeting_strategy: 'user_list',
  target_users: ['user-1', 'user-2', 'user-3']
}
```

#### 4. User Attributes
```javascript
{
  targeting_strategy: 'user_attributes',
  attribute_rules: [
    {
      attribute: 'role',
      operator: 'equals',
      value: 'admin'
    },
    {
      attribute: 'beta_tester',
      operator: 'equals',
      value: true
    }
  ]
}
```

## API Reference

### Feature Flags API

#### Get All Flags
```bash
GET /admin/feature-flags/all
```

Response:
```json
{
  "success": true,
  "flags": [
    {
      "key": "new_dashboard",
      "name": "New Dashboard UI",
      "status": "rollout",
      "rollout_percentage": 25
    }
  ]
}
```

#### Check Flag Status
```bash
GET /admin/feature-flags/check?key=new_dashboard&userId=user-123
```

Response:
```json
{
  "success": true,
  "enabled": true
}
```

#### Create/Update Flag
```bash
POST /admin/feature-flags/create
Content-Type: application/json

{
  "key": "new_feature",
  "name": "New Feature",
  "description": "Description",
  "status": "disabled",
  "targeting_strategy": "percentage",
  "rollout_percentage": 0
}
```

#### Enable Flag
```bash
POST /admin/feature-flags/enable
Content-Type: application/json

{
  "featureKey": "new_dashboard",
  "percentage": 50
}
```

#### Disable Flag
```bash
POST /admin/feature-flags/disable
Content-Type: application/json

{
  "featureKey": "new_dashboard"
}
```

#### Gradual Rollout
```bash
POST /admin/feature-flags/rollout
Content-Type: application/json

{
  "featureKey": "new_dashboard",
  "targetPercentage": 50,
  "incrementBy": 10
}
```

#### Get Statistics
```bash
GET /admin/feature-flags/statistics?key=new_dashboard
```

Response:
```json
{
  "success": true,
  "statistics": {
    "total_evaluations": 1000,
    "enabled_count": 250,
    "disabled_count": 750,
    "enabled_percentage": 25.0,
    "unique_users": 500
  }
}
```

### Deployments API

#### Create Deployment
```bash
POST /admin/deployments/create
Content-Type: application/json

{
  "version": "v2.1.0",
  "environment": "production",
  "strategy": "blue_green",
  "metadata": {
    "commit": "abc123",
    "author": "developer@mihas.edu.zm"
  }
}
```

#### Execute Deployment
```bash
POST /admin/deployments/execute
Content-Type: application/json

{
  "deploymentId": "deploy_v2.1.0_1705228800000",
  "strategy": "canary",
  "config": {
    "initialPercentage": 5,
    "incrementPercentage": 10,
    "maxPercentage": 100,
    "monitoringDuration": 300000
  }
}
```

#### Rollback Deployment
```bash
POST /admin/deployments/rollback
Content-Type: application/json

{
  "deploymentId": "deploy_v2.1.0_1705228800000"
}
```

#### Get Deployment Progress
```bash
GET /admin/deployments/progress?deploymentId=deploy_v2.1.0_1705228800000
```

Response:
```json
{
  "success": true,
  "progress": {
    "found": true,
    "deployment": {
      "deployment_id": "deploy_v2.1.0_1705228800000",
      "version": "v2.1.0",
      "status": "in_progress"
    },
    "steps": [
      {
        "step_name": "deploy_green",
        "status": "completed"
      },
      {
        "step_name": "health_check_green",
        "status": "running"
      }
    ],
    "progress": 50,
    "currentStep": {
      "step_name": "health_check_green",
      "status": "running"
    }
  }
}
```

## Frontend Integration

### React Hook for Feature Flags

```typescript
import { useState, useEffect } from 'react';

export function useFeatureFlag(featureKey: string, userId?: string) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkFlag() {
      try {
        const response = await fetch(
          `/admin/feature-flags/check?key=${featureKey}&userId=${userId}`
        );
        const data = await response.json();
        setEnabled(data.enabled);
      } catch (error) {
        console.error('Failed to check feature flag:', error);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    checkFlag();
  }, [featureKey, userId]);

  return { enabled, loading };
}
```

### Usage in Components

```typescript
function Dashboard() {
  const { enabled: newDashboard, loading } = useFeatureFlag(
    'new_dashboard',
    currentUser.id
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  return newDashboard ? <NewDashboard /> : <OldDashboard />;
}
```

## Best Practices

### 1. Feature Flag Naming

Use descriptive, kebab-case names:
```
✅ new-dashboard-ui
✅ enhanced-eligibility-engine
✅ pdf-generation-v2

❌ feature1
❌ newFeature
❌ test
```

### 2. Gradual Rollout Strategy

Start small and increase gradually:
```
5% → Monitor 5 minutes
10% → Monitor 5 minutes
25% → Monitor 10 minutes
50% → Monitor 15 minutes
100% → Complete rollout
```

### 3. Monitoring During Rollout

Monitor these metrics:
- Error rates
- Response times
- User engagement
- System resources
- User feedback

### 4. Rollback Criteria

Rollback immediately if:
- Error rate increases by >10%
- Response time increases by >50%
- Critical functionality breaks
- User complaints spike

### 5. Feature Flag Cleanup

Remove flags after full rollout:
```javascript
// After 100% rollout for 1 week
await manager.setFlag({
  key: 'old_feature',
  status: 'deprecated'
});

// Remove from code after 2 weeks
```

## Deployment Workflow

### 1. Pre-Deployment

```bash
# Create deployment
curl -X POST /admin/deployments/create \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v2.1.0",
    "environment": "production",
    "strategy": "canary"
  }'
```

### 2. Execute Deployment

```bash
# Execute canary deployment
curl -X POST /admin/deployments/execute \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "deploy_v2.1.0_1705228800000",
    "strategy": "canary",
    "config": {
      "initialPercentage": 5,
      "incrementPercentage": 10
    }
  }'
```

### 3. Monitor Progress

```bash
# Check deployment progress
curl /admin/deployments/progress?deploymentId=deploy_v2.1.0_1705228800000
```

### 4. Rollback if Needed

```bash
# Rollback deployment
curl -X POST /admin/deployments/rollback \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "deploy_v2.1.0_1705228800000"
  }'
```

## Database Schema

### feature_flags Table

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  targeting_strategy TEXT NOT NULL,
  rollout_percentage INTEGER,
  target_users TEXT[],
  attribute_rules JSONB,
  is_active BOOLEAN DEFAULT true
);
```

### deployments Table

```sql
CREATE TABLE deployments (
  id UUID PRIMARY KEY,
  deployment_id TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  environment TEXT NOT NULL,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

## Troubleshooting

### Feature Flag Not Working

1. Check flag status: `GET /admin/feature-flags/all`
2. Verify targeting rules match user attributes
3. Clear feature flag cache
4. Check RLS policies on feature_flags table

### Deployment Stuck

1. Check deployment progress
2. Review deployment steps for errors
3. Check system health metrics
4. Consider manual rollback

### Rollback Failed

1. Verify deployment exists
2. Check rollback strategy support
3. Review deployment steps
4. Manual intervention may be required

## Security Considerations

- Only admin users can manage feature flags
- All flag changes are logged in audit trail
- Feature flag evaluations are tracked
- RLS policies protect flag data
- Deployment operations require admin privileges

## Performance Tips

- Feature flags are cached for 5 minutes
- Use percentage-based targeting for large user bases
- Monitor evaluation performance
- Clean up deprecated flags regularly
- Use appropriate targeting strategies

## Next Steps

1. Review example feature flags in the system
2. Create your first feature flag
3. Test with small percentage rollout
4. Monitor metrics during rollout
5. Complete rollout or rollback based on results
