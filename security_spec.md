# Security Specification - NaturaWell

## Data Invariants
1. A user can only access (read/write) their own profile, logs, progress entries, reminders, and roadmap progress.
2. `DailyLog` fields `steps` and `water` must be non-negative numbers. `exercises`, `yoga`, and `meditation` must be booleans.
3. `RoadmapProgress` document must have a `completed` map.
4. Timestamps for creation should ideally match `request.time` (not strictly enforced in UI yet, but should be in rules).

## The "Dirty Dozen" Payloads (Attack Vectors)
1. **Identity Theft**: User A tries to read User B's profile.
2. **Path Poisoning**: Injecting extremely long strings as IDs.
3. **Type Mismatch**: Writing a string to `steps` in `DailyLog`.
4. **Boundary Violation**: Writing a negative number to `water`.
5. **Role Escalation**: Trying to create an admin document (if applicable).
6. **Relational Sync Break**: Posting a progress entry for a non-existent user path.
7. **Shadow Updates**: Adding a `hiddenVerified` field to UserProfile.
8. **PII Leak**: A signed-in user trying to list all users.
9. **Terminal State Break**: (N/A for current app state).
10. **Query Scrape**: Listing all logs across all users.
11. **Roadmap Spoof**: User A marking User B's roadmap as complete.
12. **System Field Injection**: (N/A).

## Test Plan
- Run ESLint for rules.
- Deploy rules.
- Verify through app usage.
