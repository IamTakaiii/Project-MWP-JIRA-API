# Drizzle ORM Migration Guide

## สรุปการเปลี่ยนแปลง

โปรเจคได้ทำการ migrate จาก `bun:sqlite` แบบ raw SQL ไปใช้ **Drizzle ORM** เรียบร้อยแล้ว

## ไฟล์ที่เพิ่มเข้ามา

### 1. Database Schema (`src/db/schema.ts`)
- กำหนด schema ของตาราง `sessions` ด้วย Drizzle
- Export types: `Session`, `NewSession`

### 2. Database Connection (`src/db/connection.ts`)
- สร้าง Drizzle instance ที่ใช้ Bun SQLite driver
- จัดการ graceful shutdown

### 3. Barrel Export (`src/db/index.ts`)
- Export `db` instance และ schema types

### 4. Drizzle Config (`drizzle.config.ts`)
- Configuration สำหรับ Drizzle Kit CLI tools

## ไฟล์ที่แก้ไข

### `src/services/session.service.ts`
- เปลี่ยนจาก raw SQL queries เป็น Drizzle query builder
- ใช้ type-safe operations: `db.select()`, `db.insert()`, `db.update()`, `db.delete()`
- ใช้ Drizzle operators: `eq()`, `or()`, `lt()`, `sql()`

### `package.json`
- เพิ่ม dependencies: `drizzle-orm`
- เพิ่ม dev dependencies: `drizzle-kit`
- เพิ่ม scripts:
  - `db:generate` - สร้าง migration files
  - `db:migrate` - รัน migrations
  - `db:push` - push schema ไปยัง database
  - `db:studio` - เปิด Drizzle Studio (GUI)

## ข้อดีของ Drizzle ORM

1. **Type Safety** - TypeScript types ที่ถูกต้อง 100%
2. **Auto-completion** - IDE จะแนะนำ columns และ methods
3. **Query Builder** - เขียน queries แบบ chainable และอ่านง่าย
4. **Migration Tools** - จัดการ schema changes ได้ง่าย
5. **Drizzle Studio** - GUI สำหรับดู/แก้ไขข้อมูล

## คำสั่งที่ใช้งาน

```bash
# Development
bun run dev

# Database Management
bun run db:push      # Sync schema to database
bun run db:generate  # Generate migration files
bun run db:migrate   # Run migrations
bun run db:studio    # Open Drizzle Studio

# Type checking
bun run typecheck
```

## ตัวอย่างการใช้งาน

```typescript
import { db, sessions } from '@/db'
import { eq } from 'drizzle-orm'

// Select
const session = db.select()
  .from(sessions)
  .where(eq(sessions.sessionId, 'abc123'))
  .get()

// Insert
db.insert(sessions)
  .values({
    sessionId: 'abc123',
    jiraUrl: 'https://jira.example.com',
    email: 'user@example.com',
    apiToken: 'token',
    createdAt: new Date(),
    lastAccessed: new Date(),
  })
  .run()

// Update
db.update(sessions)
  .set({ lastAccessed: new Date() })
  .where(eq(sessions.sessionId, 'abc123'))
  .run()

// Delete
db.delete(sessions)
  .where(eq(sessions.sessionId, 'abc123'))
  .run()
```

## หมายเหตุ

- Database schema เดิมยังคงใช้งานได้ (backward compatible)
- ไม่จำเป็นต้อง migrate ข้อมูลเดิม
- Session data ที่มีอยู่จะทำงานได้ปกติ
