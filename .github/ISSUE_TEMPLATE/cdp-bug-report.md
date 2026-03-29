---
name: CDP Bug Report
about: Report a bug in the Customer Data Platform
title: '[CDP Bug] '
labels: ['cdp', 'bug']
assignees: ''

---

## 🐛 Bug Description

A clear and concise description of what the bug is.

## 🎯 CDP Component

- [ ] Event Ingestion
- [ ] Identity Resolution
- [ ] Segment Builder
- [ ] User Profiles
- [ ] Consent Tracking
- [ ] Real-time Updates
- [ ] Integration Hub
- [ ] API/Endpoints
- [ ] Other (please specify)

## 🔄 Reproduction Steps

Please provide detailed steps to reproduce the issue:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## 🎯 Expected Behavior

A clear and concise description of what you expected to happen.

## ❌ Actual Behavior

A clear and concise description of what actually happened.

## 📱 Environment

- **Backend Version**: [e.g., v1.0.0]
- **Node.js Version**: [e.g., 20.x]
- **Database**: [e.g., PostgreSQL 16]
- **Redis Version**: [e.g., 7.x]
- **Environment**: [e.g., staging, production]
- **Browser/Client**: [if applicable]

## 📋 Error Details

### Error Message
```
Paste the full error message here
```

### Stack Trace
```
Paste the full stack trace here
```

### API Response
```json
{
  "error": "Paste API error response here"
}
```

## 📊 Relevant Data

### Event Data (if applicable)
```json
{
  "eventType": "PAGE_VIEW",
  "source": "WEB",
  "eventName": "homepage_visit",
  "properties": {
    "page": "/home"
  }
}
```

### Segment Configuration (if applicable)
```json
{
  "name": "Active Users",
  "type": "VISUAL",
  "conditions": [
    {
      "field": "eventCount",
      "operator": "greater_than",
      "value": 10
    }
  ]
}
```

### User ID / Anonymous ID
- User ID: `user_123`
- Anonymous ID: `anon_456`

## 🔍 Debugging Information

### Database Queries
```sql
-- Paste relevant database queries here
SELECT * FROM cdp_events WHERE user_id = 'user_123';
```

### Redis Cache Keys
```
cdp:profile:user_123
cdp:consent:user_123
cdp:segment:segment_789:users
```

### Logs
```
Paste relevant application logs here
```

## 🚨 Impact Assessment

### Severity
- [ ] Critical - System down or major functionality broken
- [ ] High - Significant impact on user experience
- [ ] Medium - Some functionality affected but workaround exists
- [ ] Low - Minor issue with minimal impact

### Affected Users
- [ ] All users
- [ ] Specific user segment
- [ ] Internal users only
- [ ] Unknown

### Business Impact
- [ ] Revenue loss
- [ ] User experience degradation
- [ ] Data integrity concerns
- [ ] Compliance/GDPR issues
- [ ] Performance degradation

## 🔧 Possible Solutions

### What you tried
- [ ] Restarted the service
- [ ] Cleared cache
- [ ] Checked database connectivity
- [ ] Verified API keys/integrations

### Suggested fix
Describe what you think might fix the issue.

## 📷 Screenshots

If applicable, add screenshots to help explain your problem.

## 📎 Additional Context

Add any other context about the problem here.

### Related Issues
- #123 - Related issue
- #456 - Another related issue

### Pull Requests
- #789 - Proposed fix

## ✅ Checklist

- [ ] I have checked existing issues for duplicates
- [ ] I have provided all relevant information
- [ ] I have included error messages and logs
- [ ] I have specified the CDP component affected
- [ ] I have assessed the impact and severity
