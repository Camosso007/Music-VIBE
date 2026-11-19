# Security Specification & Data Invariants — VIBE ROOM

## 1. Data Invariants
1. **PII Isolation**: User emails, notification preferences, and blocked UIDs live strictly in `/users_private/{userId}`, readable and writable exclusively by the owner (`request.auth.uid == userId`). Public profiles (`/users_public/{userId}`) contain zero PII.
2. **Private Room Confidentiality**: Rooms with `visibility == 'private'` cannot be listed globally. They are accessible only to their creator, verified members in `/rooms/{roomId}/members/{uid}`, or via an exact `/room_invites/{inviteCode}` lookup (`allow list: if false`).
3. **Self-Assigned Privilege Prevention**: Users joining a room as a new member can only register with `role == 'listener'` unless they are the room's `creatorId` (`role == 'admin'`). Only room admins can promote/demote DJs or mute users.
4. **Immortal Ownership & Temporal Integrity**: `creatorId`, `ownerId`, `senderUid`, and `createdAt` are immutable once created, and timestamps are validated against `request.time`.
5. **Bounded Arrays & String Limits**: Every string validates `.size() <= MAX` and every array (`favoriteGenres`, `badges`, `voterUids`, `participants`, `mentions`, `votesA`, `votesB`) has explicit upper bounds.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read on private profile**: `GET /users_private/user123` with `auth == null`.
2. **Cross-user PII read**: `GET /users_private/victimUid` signed in as `attackerUid`.
3. **Shadow field injection on profile create**: `POST /users_public/attackerUid` adding `{ isAdmin: true }`.
4. **Self-assigned DJ/Admin escalation on room join**: `POST /rooms/room1/members/attackerUid` with `{ role: 'admin' }` when `creatorId != attackerUid`.
5. **Uninvited private room member insertion**: `POST /rooms/privateRoom/members/attackerUid` with wrong `inviteCode`.
6. **Private room enumeration attack**: `LIST /rooms` without `visibility in ['public', 'exclusive']` filter.
7. **Muted user chat bypass**: `POST /rooms/room1/messages/msg1` when `members/attackerUid.isMuted == true`.
8. **Chat message impersonation**: `POST /rooms/room1/messages/msg1` with `senderUid: 'victimUid'` while signed in as `attackerUid`.
9. **DM thread eavesdropping**: `GET /dm_threads/thread1/messages/m1` when `attackerUid` is not in `thread1.participants`.
10. **Notification tampering**: `LIST /notifications` querying another user's `recipientUid`.
11. **Terminal battle vote tampering**: `UPDATE /rooms/room1/battles/b1` modifying `votesA` when `status == 'finished'`.
12. **ID poisoning**: `GET /rooms/<1500-char-invalid-id>` failing `isValidId()`.
