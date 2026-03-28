/**
 * Test Debouncing
 * 
 * Simulates 10 rapid search keystrokes and measures network calls.
 * With debouncing: should see 1-2 API calls (deferred)
 * Without debouncing: would see 10+ API calls (one per keystroke)
 * 
 * Run in browser console: import('./utils/test-debounce.js').then(() => window.testDebounce())
 * Or add to a test button temporarily
 */

export function testDebounce() {
  console.log('🧪 Starting debounce test...\n');

  // Intercept fetch to count API calls
  const originalFetch = window.fetch;
  let apiCallCount = 0;
  const apiCalls = [];

  window.fetch = function(...args) {
    if (args[0].includes('/meals')) {
      apiCallCount++;
      apiCalls.push({
        timestamp: new Date().toISOString(),
        url: args[0],
      });
      console.log(`  [API Call #${apiCallCount}] ${args[0]}`);
    }
    return originalFetch.apply(this, args);
  };

  // Find the search input
  const searchInput = document.querySelector('input[type="text"]');
  if (!searchInput) {
    console.error('❌ Search input not found');
    window.fetch = originalFetch;
    return;
  }

  console.log('📝 Found search input. Simulating 10 rapid keystrokes...\n');

  // Simulate rapid keystrokes
  const searchTerms = ['m', 'ma', 'mac', 'maca', 'macar', 'macard', 'macaroni', 'macaron', 'macarone', 'macaroni'];
  let keystrokeCount = 0;

  searchTerms.forEach((term, index) => {
    setTimeout(() => {
      keystrokeCount++;
      searchInput.value = term;
      // Trigger change event (React listening)
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(
        `  Keystroke #${keystrokeCount}: typed "${term}"`
      );
    }, index * 50); // 50ms between keystrokes
  });

  // Check results after debounce should have fired
  setTimeout(() => {
    console.log('\n✅ Test complete!\n');
    console.log(`📊 Results:`);
    console.log(`   Keystrokes: ${keystrokeCount}`);
    console.log(`   API calls: ${apiCallCount}`);
    
    if (apiCallCount <= 2) {
      console.log(`   ✅ DEBOUNCING WORKING! (1-2 calls instead of ${keystrokeCount})`);
    } else {
      console.log(`   ⚠️  Fewer API calls than keystrokes, but check if debouncing is optimized`);
    }

    if (apiCalls.length > 0) {
      console.log('\n📡 API calls made:');
      apiCalls.forEach((call, i) => {
        console.log(`   ${i + 1}. ${new URL(call.url).search}`);
      });
    }

    // Restore fetch
    window.fetch = originalFetch;
    console.log('\n🧹 Test cleanup: fetch restored\n');
  }, searchTerms.length * 50 + 400); // Wait for debounce delay + buffer
}

console.log('✨ Debounce test loaded. Run: window.testDebounce()');
