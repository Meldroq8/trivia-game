/**
 * Puppeteer Test Script - Trivia Game Flow
 * Run: node test-game-flow.js
 */

import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting trivia game flow test...\n');

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true to run without UI
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();

  // Listen to console logs from the browser
  const browserLogs = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();

    // Store all logs for later analysis
    browserLogs.push({ type, text });

    // Print errors, warnings, and specific debug logs
    if (type === 'error' || type === 'warning' || text.includes('🔍') || text.includes('DEBUG')) {
      console.log(`   [Browser ${type}]: ${text}`);
    }
  });

  try {
    // Step 1: Navigate to homepage
    console.log('📍 Step 1: Navigating to http://localhost:5173/');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Homepage loaded\n');

    // Take screenshot of homepage
    await page.screenshot({ path: 'screenshots/01-homepage.png' });
    console.log('📸 Screenshot saved: 01-homepage.png\n');

    // Step 2: Check if elements are present
    console.log('🔍 Step 2: Checking homepage elements...');
    const title = await page.title();
    console.log(`   Page title: ${title}`);

    const hasStartButton = await page.$('button') !== null;
    console.log(`   Start button present: ${hasStartButton ? '✅' : '❌'}\n`);

    // Step 3: Try to start a game (if start button exists)
    if (hasStartButton) {
      console.log('🎮 Step 3: Attempting to start game...');

      // Look for buttons with text like "بدء", "Start", "ابدأ"
      const buttons = await page.$$('button');
      console.log(`   Found ${buttons.length} buttons\n`);

      // Click first button (usually "Start Game")
      if (buttons.length > 0) {
        await buttons[0].click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('✅ Clicked start button\n');

        await page.screenshot({ path: 'screenshots/02-after-start.png' });
        console.log('📸 Screenshot saved: 02-after-start.png\n');
      }
    }

    // Step 3.5: Login if modal appears
    console.log('🔐 Step 3.5: Checking for login modal...');
    const emailInput = await page.$('input[type="email"], input[placeholder*="example"]');
    if (emailInput) {
      console.log('   Login modal detected, filling credentials...');

      // Clear and fill email
      await emailInput.click({ clickCount: 3 }); // Select all
      await emailInput.type('f17@live.at');
      const emailValue = await page.evaluate(el => el.value, emailInput);
      console.log(`   ✅ Email entered: ${emailValue}`);

      // Clear and fill password
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.click({ clickCount: 3 }); // Select all
        await passwordInput.type('q8sora.com');
        const passValue = await page.evaluate(el => el.value, passwordInput);
        console.log(`   ✅ Password entered (length: ${passValue.length} chars)`);

        // Press Enter to submit
        await passwordInput.press('Enter');
        console.log('   ✅ Pressed Enter to submit form');
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({ path: 'screenshots/04-login-filled.png' });
      console.log('📸 Screenshot saved: 04-login-filled.png\n');

      // Wait for login to complete
      if (passwordInput) {
        // Wait for either modal to close or navigation to occur
        console.log('   ⏳ Waiting for login to complete...');

        try {
          // Wait up to 5 seconds for the password field to disappear (modal closed)
          await page.waitForFunction(
            () => !document.querySelector('input[type="password"]'),
            { timeout: 5000 }
          );
          console.log('   ✅ Login successful - modal closed');
        } catch (e) {
          console.log('   ⚠️ Modal did not close within 5 seconds');
        }

        await page.screenshot({ path: 'screenshots/05-after-login.png' });
        console.log('📸 Screenshot saved: 05-after-login.png\n');
      }
    } else {
      console.log('   No login modal detected\n');
    }

    // Step 4: Check for login errors
    console.log('🔍 Step 4: Checking for errors...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    const errorText = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('[class*="error"], [class*="alert"]');
      return Array.from(errorElements).map(el => el.textContent).join(' ');
    });
    if (errorText) {
      console.log(`   ⚠️ Error detected: ${errorText}`);
    } else {
      console.log('   No errors detected');
    }

    // Check if modal is still open
    const modalStillOpen = await page.$('input[type="password"]') !== null;
    console.log(`   Login modal still open: ${modalStillOpen ? '❌' : '✅'}\n`);

    // Step 5: If logged in, try to create a new game
    if (!modalStillOpen) {
      console.log('🎮 Step 5: Attempting to create new game after login...');

      // Look for "Create New Game" button
      const createGameButtons = await page.$$('button');
      for (const btn of createGameButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('إنشاء لعبة جديدة') || text.includes('جديدة')) {
          await btn.click();
          console.log('   ✅ Clicked create game button');
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }

      await page.screenshot({ path: 'screenshots/06-after-create-game.png' });
      console.log('📸 Screenshot saved: 06-after-create-game.png\n');
    }

    // Step 6: Check current URL and page state
    console.log('🔍 Step 6: Checking navigation...');
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}\n`);

    // Step 7: Look for category selection or game setup
    const pageContent = await page.content();
    const hasCategories = pageContent.includes('category') || pageContent.includes('فئة');
    const hasQuestions = pageContent.includes('question') || pageContent.includes('سؤال');
    const hasGameSetup = pageContent.includes('setup') || pageContent.includes('إعداد');

    console.log('📊 Step 7: Page content check:');
    console.log(`   Has categories: ${hasCategories ? '✅' : '❌'}`);
    console.log(`   Has questions: ${hasQuestions ? '✅' : '❌'}`);
    console.log(`   Has game setup: ${hasGameSetup ? '✅' : '❌'}\n`);

    // Step 8: Fill in game setup form if on game-setup page
    if (currentUrl.includes('game-setup')) {
      console.log('🎮 Step 8: Filling game setup form...');

      // Fill game name
      const gameNameInput = await page.$('input[placeholder*="اسم اللعبة"]');
      if (gameNameInput) {
        await gameNameInput.type('Test Game');
        console.log('   ✅ Game name entered');
      }

      // Fill team 1 name
      const team1Input = await page.$('input[placeholder*="الفريق"]:first-of-type');
      if (team1Input) {
        await team1Input.type('Team Alpha');
        console.log('   ✅ Team 1 name entered');
      }

      // Fill team 2 name - get all team inputs and use the second one
      const teamInputs = await page.$$('input[placeholder*="الفريق"]');
      if (teamInputs.length >= 2) {
        await teamInputs[1].type('Team Beta');
        console.log('   ✅ Team 2 name entered');
      }

      await page.screenshot({ path: 'screenshots/07-game-setup-filled.png' });
      console.log('📸 Screenshot saved: 07-game-setup-filled.png\n');

      // Click Start Game button
      console.log('🎮 Step 9: Starting game...');
      const startButtons = await page.$$('button');
      for (const btn of startButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('ابدأ اللعبة')) {
          await btn.click();
          console.log('   ✅ Clicked start game button');
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        }
      }

      await page.screenshot({ path: 'screenshots/08-after-start-game.png' });
      console.log('📸 Screenshot saved: 08-after-start-game.png\n');
    }

    // Step 10: Check if we're on category selection
    const newUrl = page.url();
    console.log(`🔍 Step 10: Current URL: ${newUrl}`);

    if (newUrl.includes('categories') || newUrl.includes('category-selection')) {
      console.log('🎯 Step 11: On category selection page, waiting for categories to load...');

      // Wait for categories to load - wait for actual content (not skeleton placeholders)
      try {
        await page.waitForFunction(
          () => {
            const cards = document.querySelectorAll('[class*="category"]');
            // Check if there are cards with actual text content (not just placeholders)
            const loadedCards = Array.from(cards).filter(card => {
              const text = card.textContent.trim();
              return text.length > 0 && !text.includes('skeleton');
            });
            return loadedCards.length >= 6;
          },
          { timeout: 10000 }
        );
        console.log('   ✅ Categories loaded');
      } catch (e) {
        console.log('   ⚠️ Timeout waiting for categories to load, proceeding anyway...');
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.screenshot({ path: 'screenshots/09-categories-loaded.png' });
      console.log('📸 Screenshot saved: 09-categories-loaded.png\n');

      console.log('🎯 Step 11b: Selecting categories...');

      // Find clickable category cards - exclude navigation buttons
      const allButtons = await page.$$('button');
      const categoryButtons = [];

      for (const btn of allButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        const trimmedText = text.trim();

        // Exclude back button and "choose other categories" button
        if (!trimmedText.includes('الرجوع') &&
            !trimmedText.includes('أخرى') &&
            trimmedText.length > 0) {
          categoryButtons.push(btn);
        }
      }

      console.log(`   Found ${categoryButtons.length} category buttons`);

      // Select first 6 categories
      const categoriesToSelect = Math.min(6, categoryButtons.length);
      for (let i = 0; i < categoriesToSelect; i++) {
        try {
          const categoryName = await page.evaluate(el => {
            const text = el.textContent.replace(/\d+/g, '').trim();
            return text;
          }, categoryButtons[i]);

          await categoryButtons[i].click();
          console.log(`   ✅ Selected category ${i + 1}: ${categoryName}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.log(`   ⚠️ Could not click category ${i + 1}: ${e.message}`);
        }
      }

      await page.screenshot({ path: 'screenshots/10-categories-selected.png' });
      console.log('📸 Screenshot saved: 10-categories-selected.png\n');

      // Look for confirm/continue button - should appear after selecting 6 categories
      console.log('🎯 Step 12: Looking for continue/confirm button...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const allButtonsAfterSelection = await page.$$('button');
      let continueClicked = false;

      for (const btn of allButtonsAfterSelection) {
        const text = await page.evaluate(el => el.textContent, btn);
        const trimmedText = text.trim();

        // Look for continue/start button, but NOT "choose other categories" button
        if ((trimmedText.includes('متابعة') || trimmedText.includes('تأكيد') || trimmedText.startsWith('ابدأ'))
            && !trimmedText.includes('أخرى')) {
          await btn.click();
          console.log(`   ✅ Clicked continue button: "${trimmedText}"`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continueClicked = true;
          break;
        }
      }

      if (!continueClicked) {
        console.log('   ⚠️ No continue button found, the game may require exactly 6 categories');
      }

      await page.screenshot({ path: 'screenshots/11-after-category-confirm.png' });
      console.log('📸 Screenshot saved: 11-after-category-confirm.png\n');
    }

    // Step 13: Check if we're on game board
    const finalUrl = page.url();
    console.log(`🔍 Step 13: Final URL: ${finalUrl}`);

    if (finalUrl.includes('game-board') || finalUrl.includes('/game')) {
      console.log('🎮 Step 14: On game board! Testing question selection...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      await page.screenshot({ path: 'screenshots/12-game-board.png' });
      console.log('📸 Screenshot saved: 12-game-board.png\n');

      // Try to click a question cell - look for buttons with point values (200, 400, 600)
      const allButtons = await page.$$('button');
      const questionCells = [];

      for (const btn of allButtons) {
        const text = await page.evaluate(el => el.textContent.trim(), btn);
        if (text === '200' || text === '400' || text === '600') {
          questionCells.push(btn);
        }
      }

      console.log(`   Found ${questionCells.length} question cells with point values`);

      if (questionCells.length > 0) {
        // Click the first available question (200 points)
        try {
          await questionCells[0].click();
          const pointValue = await page.evaluate(el => el.textContent.trim(), questionCells[0]);
          console.log(`   ✅ Clicked question worth ${pointValue} points`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
          console.log(`   ⚠️ Could not click question: ${e.message}`);
        }

        await page.screenshot({ path: 'screenshots/13-question-view.png' });
        console.log('📸 Screenshot saved: 13-question-view.png\n');

        // Click "Show Answer" button
        console.log('🎯 Step 15: Clicking answer button...');
        const allButtonsInQuestion = await page.$$('button');
        for (const btn of allButtonsInQuestion) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text.includes('الإجابة')) {
            await btn.click();
            console.log('   ✅ Clicked answer button');
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        }

        await page.screenshot({ path: 'screenshots/14-answer-revealed.png' });
        console.log('📸 Screenshot saved: 14-answer-revealed.png\n');

        // Award points to Team Alpha (click + button)
        console.log('🎯 Step 16: Awarding points to Team Alpha...');
        const plusButtons = await page.$$('button');
        for (const btn of plusButtons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text.includes('+')) {
            await btn.click();
            console.log('   ✅ Awarded points to team');
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        }

        await page.screenshot({ path: 'screenshots/15-points-awarded.png' });
        console.log('📸 Screenshot saved: 15-points-awarded.png\n');

        // Return to board
        console.log('🎯 Step 17: Returning to game board...');
        const returnButtons = await page.$$('button');
        for (const btn of returnButtons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text.includes('الرجوع للوحة')) {
            await btn.click();
            console.log('   ✅ Returned to game board');
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        }

        await page.screenshot({ path: 'screenshots/16-back-to-board.png' });
        console.log('📸 Screenshot saved: 16-back-to-board.png\n');
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'screenshots/03-final-state.png' });
    console.log('📸 Screenshot saved: 03-final-state.png\n');

    console.log('✅ Desktop flow test completed!\n');

    // Step 18: Test responsive views
    console.log('📱 Step 18: Testing responsive views...\n');

    const devices = [
      { name: 'iPhone 12', width: 390, height: 844 },
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'Samsung Galaxy S21', width: 360, height: 800 },
      { name: 'iPad', width: 768, height: 1024 },
      { name: 'iPad Pro', width: 1024, height: 1366 },
      { name: 'Desktop HD', width: 1920, height: 1080 }
    ];

    const currentGameUrl = page.url();

    for (const device of devices) {
      console.log(`   📱 Testing ${device.name} (${device.width}x${device.height})...`);

      // Set viewport size
      await page.setViewport({
        width: device.width,
        height: device.height
      });

      // Reload current page or navigate to game board
      if (currentGameUrl.includes('/game')) {
        await page.reload({ waitUntil: 'networkidle2' });
      }

      // Wait for page to stabilize and re-render
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Trigger resize event to force React to recalculate
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if game board elements exist
      const diagnostics = await page.evaluate(() => {
        const categories = document.querySelectorAll('[class*="category"]');
        const buttons = document.querySelectorAll('button');
        const gameBoard = document.querySelector('[class*="game"]');

        return {
          categoriesCount: categories.length,
          buttonsCount: buttons.length,
          gameBoardExists: gameBoard !== null,
          bodyScrollHeight: document.body.scrollHeight,
          bodyClientHeight: document.body.clientHeight,
          windowInnerHeight: window.innerHeight,
          windowInnerWidth: window.innerWidth
        };
      });

      console.log(`      Diagnostics:`, diagnostics);

      // Take screenshot
      const deviceSlug = device.name.toLowerCase().replace(/ /g, '-');

      // Take both regular and full-page screenshot
      await page.screenshot({
        path: `screenshots/responsive-${deviceSlug}.png`,
        fullPage: false
      });

      await page.screenshot({
        path: `screenshots/responsive-${deviceSlug}-full.png`,
        fullPage: true
      });

      console.log(`   ✅ Screenshots saved: responsive-${deviceSlug}.png (+ full page)`);
    }

    console.log('\n📱 Responsive testing completed!\n');

    console.log('✅ All tests completed successfully!');
    console.log('\n📁 Screenshots saved in ./screenshots/ folder');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'screenshots/error.png' });
    console.log('📸 Error screenshot saved: error.png');
  } finally {
    // Close browser after 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    console.log('\n👋 Browser closed');
  }
})();
