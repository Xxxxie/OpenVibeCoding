import { Hono } from 'hono'
import {
  listCollections,
  createCollection,
  deleteCollection,
  queryDocuments,
  insertDocument,
  updateDocument,
  deleteDocument,
} from '../cloudbase/database.js'

const router = new Hono()

router.get('/collections', async (c) => {
  try {
    const result = await listCollections()
    return c.json(result.collections)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.post('/collections', async (c) => {
  try {
    const { name } = await c.req.json()
    await createCollection(name)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.delete('/collections/:name', async (c) => {
  try {
    await deleteCollection(c.req.param('name'))
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.get('/collections/:name/documents', async (c) => {
  try {
    const name = c.req.param('name')
    const page = Number(c.req.query('page') || '1')
    const pageSize = Number(c.req.query('pageSize') || '50')
    // search 参数：field:value 格式，或直接 _id 查询
    const search = c.req.query('search')?.trim()

    let where: Record<string, unknown> | undefined
    if (search) {
      // 支持 field:value 格式精确匹配
      if (search.includes(':')) {
        const [field, ...rest] = search.split(':')
        const val = rest.join(':')
        where = { [field.trim()]: val.trim() }
      } else {
        // 尝试作为 _id 搜索，同时支持正则模糊匹配（服务端支持的话）
        where = { _id: search }
      }
    }

    const result = await queryDocuments(name, page, pageSize, where)
    return c.json(result)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.post('/collections/:name/documents', async (c) => {
  try {
    const data = await c.req.json()
    const id = await insertDocument(c.req.param('name'), data)
    return c.json({ _id: id })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.put('/collections/:name/documents/:id', async (c) => {
  try {
    const data = await c.req.json()
    await updateDocument(c.req.param('name'), c.req.param('id'), data)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

router.delete('/collections/:name/documents/:id', async (c) => {
  try {
    await deleteDocument(c.req.param('name'), c.req.param('id'))
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default router
