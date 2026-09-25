# Playwright

### Basics

Playwright is our e2e test runner. All modern rendering engines including Chromium, Webkit and Firefox are supported. The configuration for testing can be found in ui/playwright.config.ts. Tests can be located in ui/tests. Tests are run in a headless mode by default meaning no browser is necessary. The default testing command is `npm run playwright:test`. [Other commands include](https://playwright.dev/docs/running-tests):

- `npm run playwright:open` to run in headed mode. This will show the actions happening in the browser as the test occurs.
- `npm run playwright:ui` to run in ui mode which allows you to see a full trace of your tests with watch mode, time travel debugging and more.
- `npm run playwright:report` to generate the report of the last test and see results in the browser. Reports are generated and run for failing tests by default.
- `npm run playwright:codegen` to start codegen. This is a UI that allows you to inspect elements and generate locators and assertions for them while recording manual tests.\
- `npm run playwright:debug` to start in debug mode. This opens up a browser window as well as the Playwright Inspector allowing you to step through your tests.

Playwright tests are very simple. Actions are performed just as a user would perform them and assertions are used to validate the results of those actions. Actions generally start with navigation to a page.

```javascript
import { expect, test } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
});
```

Playwright will wait by default for the page to load before continuing. Afterwards there are actions that can be taken which make use of the [Locators API](https://playwright.dev/docs/locators). Locators are a way to find an element on a page.

Playwright comes with its own [assertions](https://playwright.dev/docs/api/class-locatorassertions) in the form of expect. To make an assertion just use `expect(value)` and an appropriate matcher that reflects the expectation. For instance you can `expect(element).toBeVisible()` after performing some action.

### Fixtures

Playwright tests are based on the concept of [test fixtures](https://playwright.dev/docs/test-fixtures). This means pages are isolated between tests. Test fixtures are used to establish the environment for each test. Test fixtures are isolated meaning tests are grouped by meaning instead of their setup. To maintain a session for your test suite you can simply pass the generated storage file from globalSetup.ts as a test fixture option.

```javascript
import { expect, test } from '@playwright/test';
test.describe('unit list page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  ...
});
```

We are using the Page Object Model to simplify authoring and maintaining tests. The goal is to use a consistent way to locate elements making code reusable for each test suite. Page Object Models can be found in the `tests/fixtures` folder. The Page Object Model is simply a higher level API or abstraction over the locators provided by playwright. We will use similar naming conventions to define these. Names should be prepended with the locator action and appended with the element the action is being taken on.

```javascript
  async clickNext() {
    await this.page.getByRole('button', { name: 'Next' }).click();
  }
```

### Codegen

For quickly writing tests there is a cool feature called [Codegen](https://playwright.dev/docs/codegen-intro). Codegen is a way to quickly generate tests. Running in this mode opens two windows where one is a browser for your testing site and the other is an inspector window which will generate locators and actions based on your simulation in the browser. You can record tests, change the testing language and do many other things with codegen.

Codegen will give you the recommended locator prioritizing role. Sometimes you may have to sandbox and modify these locators, but they're relatively accurate.

### Debugging Tests

Testing can also be done from a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright). Playwright runs in Node.js so you can `console.log` inside of tests or directly within the extension. Running in UI Mode allows for a great developer experience. You can walk through tests seeing what has happened and you also get the [Playwright Inspector](https://playwright.dev/docs/debug#playwright-inspector), allowing you to step through API calls, see debug logs, explore locators and more. [Trace viewer](https://playwright.dev/docs/trace-viewer-intro) is a GUI tool that lets you explore recorded Playwright traces of tests. So you can visually see what's happening during each test. Creating trace.zip is enabled by default in the `playwright.config` file. When a test fails, that failed test will be retried twice in CI. The trace will be recorded on the first retry of a failed test. If traces are generated they can be viewed in the HTML report.

### Local Setup

The suite runs against the UI at `TEST_BASE_URL`, wherever it is served: the dev server (`npm run dev`, http://localhost:5173/), which picks up your changes as you make them, or the image. It signs in through the instance's identity provider as a test user. Tests read from environment variables; to run locally, create a `.env` file with the test user, test password and base URL. See `.env.sample` or the example below.

```
TEST_USER=tester@test.com
TEST_PASSWORD=tester123
TEST_BASE_URL=http://localhost:5173/
```

