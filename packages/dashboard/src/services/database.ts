/// <reference types="vite/client" />

import { getApiBase } from './config'

export interface CollectionInfo {
  CollectionName: string
  Count?: number
  Size?: number
}

export interface DocumentQueryResult {
  documents: any[]
  total: number
  page: number
  pageSize: number
}

export interface InferredColumn {
  key: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'json' | 'null'
  width?: number
}

class DatabaseAPI {
  private baseUrl: string

  constructor(baseUrl: string = getApiBase()) {
    this.baseUrl = baseUrl
  }

  async getCollections(): Promise<CollectionInfo[]> {
    const response = await fetch(`${this.baseUrl}/database/collections`)
    if (!response.ok) throw new Error(`Failed to fetch collections: ${response.statusText}`)
    return response.json()
  }

  async createCollection(name: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/database/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) throw new Error(`Failed to create collection: ${response.statusText}`)
  }

  async deleteCollection(name: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/database/collections/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error(`Failed to delete collection: ${response.statusText}`)
  }

  async getDocuments(
    collectionName: string,
    page: number = 1,
    pageSize: number = 50,
    search?: string,
  ): Promise<DocumentQueryResult> {
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() })
    if (search?.trim()) params.set('search', search.trim())
    const response = await fetch(
      `${this.baseUrl}/database/collections/${encodeURIComponent(collectionName)}/documents?${params}`,
    )
    if (!response.ok) throw new Error(`Failed to fetch documents: ${response.statusText}`)
    return response.json()
  }

  async createDocument(collectionName: string, data: any): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/database/collections/${encodeURIComponent(collectionName)}/documents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    )
    if (!response.ok) throw new Error(`Failed to create document: ${response.statusText}`)
    return response.json()
  }

  async updateDocument(collectionName: string, documentId: string, data: any): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/database/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(documentId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    )
    if (!response.ok) throw new Error(`Failed to update document: ${response.statusText}`)
    return response.json()
  }

  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/database/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(documentId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) throw new Error(`Failed to delete document: ${response.statusText}`)
  }

  inferColumns(documents: any[]): InferredColumn[] {
    if (documents.length === 0) return []

    const columnTypes: Record<string, Set<string>> = {}

    documents.forEach((doc) => {
      Object.entries(doc).forEach(([key, value]) => {
        if (!columnTypes[key]) columnTypes[key] = new Set()

        if (value === null || value === undefined) {
          columnTypes[key].add('null')
        } else if (typeof value === 'boolean') {
          columnTypes[key].add('boolean')
        } else if (typeof value === 'number') {
          // Unix 时间戳判断：10位(秒级) 或 13位(毫秒级)，范围在 2000~2100 年
          if (this.isTimestamp(value)) {
            columnTypes[key].add('date')
          } else {
            columnTypes[key].add('number')
          }
        } else if (typeof value === 'string') {
          if (this.isDate(value)) {
            columnTypes[key].add('date')
          } else {
            columnTypes[key].add('text')
          }
        } else if (typeof value === 'object') {
          columnTypes[key].add('json')
        }
      })
    })

    return Object.entries(columnTypes).map(([key, types]) => ({
      key,
      type: this.resolveType([...types]) as InferredColumn['type'],
    }))
  }

  private isTimestamp(n: number): boolean {
    // 秒级时间戳 (10位): 946684800 ~ 4102444800 (2000-2100)
    if (n >= 946684800 && n <= 4102444800) return true
    // 毫秒级时间戳 (13位): 946684800000 ~ 4102444800000
    if (n >= 946684800000 && n <= 4102444800000) return true
    return false
  }

  private isDate(str: string): boolean {
    const datePatterns = [/^\d{4}-\d{2}-\d{2}$/, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, /^\d{1,2}\/\d{1,2}\/\d{4}$/]
    return datePatterns.some((pattern) => pattern.test(str))
  }

  private resolveType(types: string[]): string {
    if (types.length === 0) return 'text'
    const nonNull = types.filter((t) => t !== 'null')
    if (nonNull.length === 0) return 'null'
    return nonNull[0]
  }
}

export const databaseAPI = new DatabaseAPI()
