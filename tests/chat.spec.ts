import { test, expect } from '@playwright/test'

test('upload, choose resumes, ask, show sources, keep deadline on reload and expire', async ({ page }) => {
  let deadline = 0
  let uploaded = false
  let sessionsCreated = 0
  const documents = [{ id: 'a', filename: 'alice.pdf' }, { id: 'b', filename: 'bob.pdf' }]
  await page.route('**/api/v1/chat/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sessions')) {
      sessionsCreated += 1
      deadline = Date.now() + 1_800_000
      return route.fulfill({ json: { token: 'test-session', expires_at: new Date(deadline).toISOString(), server_time: new Date().toISOString(), documents: [] } })
    }
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 })
    if (path.endsWith('/documents')) uploaded = true
    if (path.endsWith('/messages')) {
      expect(route.request().postDataJSON().document_ids).toEqual(['a'])
      return route.fulfill({ json: { answer: 'Alice knows Python [1].', sources: [{ filename: 'alice.pdf', page: 1, content: 'Python and FastAPI experience.' }] } })
    }
    return route.fulfill({ json: { expires_at: new Date(deadline).toISOString(), server_time: new Date().toISOString(), documents: uploaded ? documents : [] } })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Good questions/ })).toBeVisible()
  expect(sessionsCreated).toBe(0)
  await page.getByLabel('Upload PDF resumes').setInputFiles({ name: 'alice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') })
  await expect(page.getByLabel('Include alice.pdf')).toBeChecked()
  await page.getByLabel('Include bob.pdf').uncheck()
  await page.getByLabel('Ask about your resumes').fill('Who knows Python?')
  await page.getByRole('button', { name: 'Send question', exact: true }).click()
  await expect(page.getByText('Alice knows Python [1].')).toBeVisible()
  await page.getByText('1 supporting passages').click()
  await expect(page.getByText('Python and FastAPI experience.')).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Include alice.pdf')).toBeVisible()
  expect(sessionsCreated).toBe(1)
  await page.clock.install()
  await page.clock.fastForward(1_801_000)
  await expect(page.getByText(/Your session has ended/)).toBeVisible()
  await expect(page.getByLabel('Include alice.pdf')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => sessionStorage.getItem('cv-supporter-session-v1'))).toBeNull()
})

test('upload errors are visible and mobile layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByLabel('Upload PDF resumes').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') })
  await expect(page.getByRole('alert')).toContainText('Upload up to 10 PDFs')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'artifacts/chat-mobile.png', fullPage: true })
})

test('desktop layout and no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeVisible()
  await page.screenshot({ path: 'artifacts/chat-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})
