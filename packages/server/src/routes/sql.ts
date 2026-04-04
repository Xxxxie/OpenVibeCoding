import { Hono } from 'hono'

const router = new Hono()

router.post('/query', async (c) => {
  return c.json({ error: '请先配置 SQL 数据库连接（MySQL/PostgreSQL）' }, 501)
})

export default router
