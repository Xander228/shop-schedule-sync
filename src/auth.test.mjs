import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCredentials } from './auth.mjs';

test('requires both email and password without exposing submitted password', () => {
  assert.throws(() => validateCredentials({SCHEDULER_EMAIL:'a@example.com'}), /Set SCHEDULER_EMAIL/);
  assert.throws(() => validateCredentials({SCHEDULER_PASSWORD:'hidden'}), /Set SCHEDULER_EMAIL/);
  assert.throws(() => validateCredentials({SCHEDULER_EMAIL:'not-email',SCHEDULER_PASSWORD:'hidden'}), /email address/);
  assert.deepEqual(validateCredentials({SCHEDULER_EMAIL:' a@example.com ',SCHEDULER_PASSWORD:'hidden'}), {email:'a@example.com', password:'hidden'});
});

import { authenticatePage } from './auth.mjs';

class FakeLocator {
  constructor(page, query) { this.page=page; this.query=query; }
  first() { return this; }
  locator(q) { return new FakeLocator(this.page, q); }
  async isVisible() {
    if (this.query === 'input[type="email"]') return true;
    if (this.query === 'input[type="password"]') return !this.page.submitted;
    if (this.query === 'button[type=submit], input[type=submit]') return true;
    return false;
  }
  async fill(value) { this.page.values[this.query] = value; }
  async click() { this.page.submitted = true; }
  async press(key) { if (key==='Enter') this.page.submitted=true; }
  async waitFor({state}) { if (state !== 'hidden' || !this.page.submitted) throw new Error('Timed out'); }
}
class FakePage {
  constructor() { this.values={}; this.submitted=false; this.href=''; }
  locator(s) { return new FakeLocator(this,s); }
  getByRole() { return new FakeLocator(this,'button[type=submit], input[type=submit]'); }
  async goto(url) { this.href=url; return {status:()=>200}; }
  url() { return this.href; }
  async waitForTimeout() {}
}

test('automatic login fills and submits normal HTML email/password fields', async () => {
  const page = new FakePage();
  const c = {scheduleUrl:'https://scheduler2-0.vercel.app/',login:{}};
  await authenticatePage(page,c,{SCHEDULER_EMAIL:'user@example.com',SCHEDULER_PASSWORD:'test-secret'});
  assert.equal(page.values['input[type="email"]'],'user@example.com');
  assert.equal(page.values['input[type="password"]'],'test-secret');
  assert.equal(page.submitted,true);
});
