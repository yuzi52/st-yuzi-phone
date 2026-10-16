const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ROUTE_RENDERER = 'modules/phone-core/route-renderer.js';
const source = fs.readFileSync(path.join(ROOT, ROUTE_RENDERER), 'utf8');

function functionBlock(functionName) {
    const startNeedle = `function ${functionName}(`;
    const start = source.indexOf(startNeedle);
    assert.notEqual(start, -1, `${functionName}() should exist`);

    const nextFunction = source.indexOf('\nfunction ', start + startNeedle.length);
    const nextExport = source.indexOf('\nexport ', start + startNeedle.length);
    const candidates = [nextFunction, nextExport].filter((index) => index !== -1);
    const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
    return source.slice(start, end);
}

function assertSourceIncludes(description, snippet) {
    assert.ok(source.includes(snippet), description);
}

function main() {
    assertSourceIncludes(
        'route renderer should enumerate direct screen children instead of querying nested page content',
        'Array.from(screen.children)',
    );
    assertSourceIncludes(
        'route renderer should only clean direct phone-page children',
        "child.classList.contains('phone-page')",
    );
    const previousRemovalBlock = functionBlock('removeStaleRoutePages');
    assert.ok(previousRemovalBlock.includes('removeRoutePage(routePage);'),
        'replaced pages must release their lifecycle resources');
    assert.ok(
        !previousRemovalBlock.includes('renderToken'),
        'previous page removal should not accept or use renderToken',
    );

    const commitBlock = functionBlock('commitRoutePage');
    assert.ok(
        commitBlock.includes('removeStaleRoutePages(screen, [page]);'),
        'direct switching must retain only the committed page',
    );
    assert.ok(
        commitBlock.includes("page.classList.add('phone-page-active');"),
        'the committed page is active without an entrance-animation delay',
    );
    assert.doesNotMatch(source, /animationend|ROUTE_ANIMATION_FALLBACK_MS/,
        'direct switching must not retain animation listeners or fallback timers');
    assert.ok(
        commitBlock.includes('removeRoutePage(page);'),
        'a stale direct commit should dispose its uncommitted route page',
    );

    const scheduleBlock = functionBlock('scheduleRouteCommit');
    const skipLogIndex = scheduleBlock.indexOf("action: 'commit.schedule.skip'");
    assert.notEqual(skipLogIndex, -1, 'scheduled commit skip log should still exist');
    assert.ok(
        scheduleBlock.slice(Math.max(0, skipLogIndex - 120), skipLogIndex).includes('logger.debug({'),
        'scheduled commit skip should be logged at debug level because stale delayed commits are expected',
    );
    assert.ok(
        scheduleBlock.includes('removeRoutePage(page);'),
        'a stale scheduled commit should dispose its uncommitted route page',
    );

    console.log('[route-renderer-page-cleanup-check] passed');
    console.log(`- OK | ${ROUTE_RENDERER} switches directly to one active .phone-page`);
    console.log(`- OK | ${ROUTE_RENDERER} removes stale .phone-page siblings on commit`);
    console.log(`- OK | ${ROUTE_RENDERER} does not cancel previous-page removal with stale render tokens`);
    console.log(`- OK | ${ROUTE_RENDERER} disposes route-page lifecycle on every removal path`);
}

main();
