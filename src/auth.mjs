
const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[name="email" i]',
  'input[id*="email" i]',
  'input[name="username" i]',
  'input[type="text"]'
];
const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]'
];

export function validateCredentials(env = process.env) {
  const email = (env.SCHEDULER_EMAIL || '').trim();
  const password = env.SCHEDULER_PASSWORD || '';
  if (!email || !password) throw new Error('Set SCHEDULER_EMAIL and SCHEDULER_PASSWORD as local .env values and GitHub Actions secrets. Do not put them in config.json or source code.');
  if (!email.includes('@')) throw new Error('SCHEDULER_EMAIL does not look like an email address.');
  return {email,password};
}

async function firstVisible(page, selectors) {
  for (const selector of selectors.filter(Boolean)) {
    const element = page.locator(selector).first();
    if (await element.isVisible().catch(() => false)) return element;
  }
  return null;
}

function fieldSelectors(custom, fallbacks) {
  return custom ? [custom] : fallbacks;
}

/**
 * Logs in to a basic email/password form without exposing secrets to logs.
 * A login-form or post-login page change requires site-specific configuration
 * when the site's markup does not match common HTML patterns.
 */
export async function authenticatePage(page, config, env = process.env) {
  const {email, password} = validateCredentials(env);
  const login = config.login || {};
  const loginUrl = login.url || config.scheduleUrl;
  const response = await page.goto(loginUrl, {waitUntil:'domcontentloaded', timeout:45000});
  if (!response || response.status() >= 400) throw new Error('Scheduler login page failed to load.');

  if (login.openLoginSelector) {
    const opener = await firstVisible(page, [login.openLoginSelector]);
    if (opener) await opener.click();
  }

  const passwordSelectors = fieldSelectors(login.passwordSelector, PASSWORD_SELECTORS);
  let passwordField = null;
  for (let i=0; i<20 && !passwordField; i++) {
    passwordField = await firstVisible(page, passwordSelectors);
    if (!passwordField) await page.waitForTimeout(350);
  }
  if (!passwordField) {
    // Could already be logged in. Only accept this state if there is an
    // explicitly configured schedule row to prove it is the expected page.
    if (config.rowSelector && await page.locator(config.rowSelector).first().isVisible().catch(() => false)) {
      console.log('Schedule visible without login form.');
      return page;
    }
    throw new Error('Could not find the email/password login form. Inspect the local login screenshot and set config.login selectors. Nothing was synced.');
  }

  const emailField = await firstVisible(page, fieldSelectors(login.emailSelector, EMAIL_SELECTORS));
  if (!emailField) throw new Error('Found the password field but could not locate the email field. Configure login.emailSelector. Nothing was synced.');
  await emailField.fill(email);
  await passwordField.fill(password);

  if (login.submitSelector) {
    await page.locator(login.submitSelector).first().click();
  } else {
    // Prefer the actual form submit button. Some React forms do not submit
    // when Enter is pressed in a password field.
    const formSubmit = passwordField.locator('xpath=ancestor::form[1]').locator('button[type=submit], input[type=submit]').first();
    const namedSubmit = page.getByRole('button', {name:/^(sign in|log in|login|sign-in)$/i}).first();
    if (await formSubmit.isVisible().catch(() => false)) {
      await formSubmit.click();
    } else if (await namedSubmit.isVisible().catch(() => false)) {
      await namedSubmit.click();
    } else {
      await passwordField.press('Enter');
    }
  }

  try {
    await passwordField.waitFor({state:'hidden',timeout:20000});
  } catch {
    throw new Error('The scheduler did not leave the login form. Check your credentials or configure the login submit selector. Nothing was synced.');
  }

  if (page.url() !== config.scheduleUrl) {
    const scheduleResponse = await page.goto(config.scheduleUrl, {waitUntil:'domcontentloaded',timeout:45000});
    if (!scheduleResponse || scheduleResponse.status() >= 400) throw new Error('Schedule page failed to load after login.');
  }
  await page.waitForTimeout(1800);
  if (await firstVisible(page,passwordSelectors)) throw new Error('Still seeing a login form after authentication. Nothing was synced.');
  if (login.successSelector) {
    await page.locator(login.successSelector).first().waitFor({state:'visible',timeout:15000});
  }
  console.log('Scheduler login completed without storing the password.');
  return page;
}
