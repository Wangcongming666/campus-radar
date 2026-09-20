import { describe, expect, it } from 'vitest'

import { parseJobRows } from './parseJobRows'

describe('parseJobRows', () => {
  it('separates valid rows from rows with blocking field errors', () => {
    const preview = parseJobRows([
      ['公司名称', '职位名称', '城市', '投递链接', '截止时间'],
      ['星海科技', '前端工程师', '上海', 'https://example.com/apply', '2026-10-20'],
      ['', '产品经理', '北京', 'invalid', 'not-a-date'],
    ])
    expect(preview.validRows).toHaveLength(1)
    expect(preview.invalidRows[0]?.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['companyName', 'applyUrl', 'deadline']))
  })
})
