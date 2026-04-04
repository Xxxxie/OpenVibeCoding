import { Hono } from 'hono'
import { getManager } from '../cloudbase/database.js'

const router = new Hono()

// 获取函数列表
router.get('/', async (c) => {
  try {
    const manager = await getManager()
    const result = await manager.functions.getFunctionList(100, 0)
    const functions = (result.Functions || []).map((f: any) => ({
      name: f.FunctionName,
      runtime: f.Runtime,
      status: f.Status,
      codeSize: f.CodeSize,
      description: f.Description,
      addTime: f.AddTime,
      modTime: f.ModTime,
      memSize: f.MemorySize,
      timeout: f.Timeout,
      type: f.Type,
    }))
    return c.json(functions)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 调用函数
router.post('/:name/invoke', async (c) => {
  try {
    const manager = await getManager()
    const name = c.req.param('name')
    const body = await c.req.json()
    const result = await manager.functions.invokeFunction(name, body)
    return c.json({ result: result.RetMsg })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default router
