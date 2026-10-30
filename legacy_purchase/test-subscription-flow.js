/**
 * Test script for subscription flow
 * 
 * This script tests the updated /api/check-free-limit endpoint
 * Run with: node test-subscription-flow.js
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// Test cases
const tests = [
    {
        name: 'Free User - First Request',
        payload: {
            device_id: 'test-free-user-001',
            is_premium: false
        },
        expectedFields: ['image_generation', 'free_limit', 'remaining'],
        expectedValues: {
            image_generation: true,
            free_limit: 3,
            remaining: 3
        }
    },
    {
        name: 'Premium User - Week Plan',
        payload: {
            device_id: 'test-premium-week-001',
            is_premium: true,
            purchase_id: 'week-test-001',
            plan_type: 'week',
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        expectedFields: ['image_generation', 'subscription', 'total_days', 'current_day'],
        expectedValues: {
            image_generation: true
        },
        subscriptionChecks: {
            plan_type: 'week',
            total_quota: 50,
            total_days: 7
        }
    },
    {
        name: 'Premium User - Month75 Plan',
        payload: {
            device_id: 'test-premium-month75-001',
            is_premium: true,
            purchase_id: 'month75-test-001',
            plan_type: 'month75',
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        expectedFields: ['image_generation', 'subscription'],
        subscriptionChecks: {
            plan_type: 'month75',
            total_quota: 75
        }
    },
    {
        name: 'Premium User - Month150 Plan',
        payload: {
            device_id: 'test-premium-month150-001',
            is_premium: true,
            purchase_id: 'month150-test-001',
            plan_type: 'month150',
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        expectedFields: ['image_generation', 'subscription'],
        subscriptionChecks: {
            plan_type: 'month150',
            total_quota: 150
        }
    },
    {
        name: 'Premium User - Year Plan',
        payload: {
            device_id: 'test-premium-year-001',
            is_premium: true,
            purchase_id: 'year-test-001',
            plan_type: 'year',
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        },
        expectedFields: ['image_generation', 'subscription'],
        subscriptionChecks: {
            plan_type: 'year',
            total_quota: 900
        }
    },
    {
        name: 'Premium User - Missing Fields (should fail)',
        payload: {
            device_id: 'test-premium-incomplete-001',
            is_premium: true
            // Missing purchase_id, purchase_date, expiry_date
        },
        shouldFail: true,
        expectedError: 'purchase_id is required'
    },
    {
        name: 'Free User - Missing device_id (should fail)',
        payload: {
            is_premium: false
        },
        shouldFail: true,
        expectedError: 'device_id is required'
    },
    {
        name: 'Multiple Subscriptions - Week + Month75',
        payload: {
            device_id: 'test-premium-multi-001',
            is_premium: true,
            subscriptions: [
                {
                    purchase_id: 'week-multi-001',
                    plan_type: 'week',
                    purchase_date: new Date().toISOString(),
                    expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    purchase_id: 'month75-multi-001',
                    plan_type: 'month75',
                    purchase_date: new Date().toISOString(),
                    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }
            ]
        },
        expectedFields: ['image_generation', 'subscription', 'subscriptions'],
        expectedValues: {
            image_generation: true
        }
    },
    {
        name: 'Multiple Subscriptions - All Three Plans',
        payload: {
            device_id: 'test-premium-multi-002',
            is_premium: true,
            subscriptions: [
                {
                    purchase_id: 'week-multi-002',
                    plan_type: 'week',
                    purchase_date: new Date().toISOString(),
                    expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    purchase_id: 'month150-multi-002',
                    plan_type: 'month150',
                    purchase_date: new Date().toISOString(),
                    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    purchase_id: 'year-multi-002',
                    plan_type: 'year',
                    purchase_date: new Date().toISOString(),
                    expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
                }
            ]
        },
        expectedFields: ['image_generation', 'subscription', 'subscriptions'],
        expectedValues: {
            image_generation: true
        }
    },
    {
        name: 'Stale Data Fix - First Request Should Return Latest',
        payload: {
            device_id: 'test-stale-fix-001',
            is_premium: true,
            purchase_id: 'week-stale-test-001',
            plan_type: 'week',
            purchase_date: new Date().toISOString(),
            expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        expectedFields: ['image_generation', 'subscription'],
        subscriptionChecks: {
            plan_type: 'week',
            total_quota: 50
        }
    }
];

// Color codes for terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTest(test) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`TEST: ${test.name}`, 'blue');
    log('='.repeat(60), 'cyan');

    try {
        log('\nRequest:', 'yellow');
        console.log(JSON.stringify(test.payload, null, 2));

        const response = await axios.post(
            `${API_BASE}/api/check-free-limit`,
            test.payload,
            {
                headers: { 'Content-Type': 'application/json' },
                validateStatus: () => true // Don't throw on any status
            }
        );

        log('\nResponse:', 'yellow');
        console.log(JSON.stringify(response.data, null, 2));

        // Check if test should fail
        if (test.shouldFail) {
            if (response.data.success === false) {
                if (test.expectedError && response.data.message.includes(test.expectedError)) {
                    log(`\n✓ PASS - Failed as expected: ${response.data.message}`, 'green');
                    return true;
                } else {
                    log(`\n✗ FAIL - Wrong error message`, 'red');
                    log(`Expected: ${test.expectedError}`, 'red');
                    log(`Got: ${response.data.message}`, 'red');
                    return false;
                }
            } else {
                log('\n✗ FAIL - Should have failed but succeeded', 'red');
                return false;
            }
        }

        // Check success
        if (!response.data.success) {
            log(`\n✗ FAIL - Request failed: ${response.data.message}`, 'red');
            return false;
        }

        const data = response.data.data;

        // Check expected fields
        if (test.expectedFields) {
            for (const field of test.expectedFields) {
                const keys = field.split('.');
                let value = data;
                for (const key of keys) {
                    value = value?.[key];
                }
                
                if (value === undefined) {
                    log(`\n✗ FAIL - Missing field: ${field}`, 'red');
                    return false;
                }
            }
        }

        // Check expected values
        if (test.expectedValues) {
            for (const [key, expected] of Object.entries(test.expectedValues)) {
                if (data[key] !== expected) {
                    log(`\n✗ FAIL - Wrong value for ${key}`, 'red');
                    log(`Expected: ${expected}`, 'red');
                    log(`Got: ${data[key]}`, 'red');
                    return false;
                }
            }
        }

        // Check subscription-specific values
        if (test.subscriptionChecks && data.subscription) {
            for (const [key, expected] of Object.entries(test.subscriptionChecks)) {
                if (data.subscription[key] !== expected) {
                    log(`\n✗ FAIL - Wrong subscription value for ${key}`, 'red');
                    log(`Expected: ${expected}`, 'red');
                    log(`Got: ${data.subscription[key]}`, 'red');
                    return false;
                }
            }

            // Verify distribution fields
            if (data.subscription.today_allocated === undefined) {
                log('\n✗ FAIL - Missing today_allocated', 'red');
                return false;
            }

            if (data.subscription.total_days === undefined) {
                log('\n✗ FAIL - Missing total_days', 'red');
                return false;
            }

            if (data.subscription.current_day === undefined) {
                log('\n✗ FAIL - Missing current_day', 'red');
                return false;
            }

            log('\n📊 Distribution Info:', 'yellow');
            log(`   Today Allocated: ${data.subscription.today_allocated}`);
            log(`   Today Remaining: ${data.subscription.today_remaining}`);
            log(`   Total Quota: ${data.subscription.total_quota}`);
            log(`   Remaining Quota: ${data.subscription.remaining_quota}`);
            log(`   Day ${data.subscription.current_day} of ${data.subscription.total_days}`);
        }

        // Check for multiple subscriptions
        if (data.subscriptions && data.subscriptions.length > 1) {
            log(`\n📦 Multiple Subscriptions Found: ${data.subscriptions.length}`, 'yellow');
            data.subscriptions.forEach((sub, index) => {
                log(`   ${index + 1}. ${sub.planType} - Today: ${sub.todayRemaining} remaining`);
            });
            log(`   Total Available Today: ${data.total_available_images}`);
        }

        log('\n✓ PASS', 'green');
        return true;

    } catch (error) {
        log('\n✗ FAIL - Request error', 'red');
        console.error(error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        return false;
    }
}

async function runAllTests() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║       SUBSCRIPTION FLOW TEST SUITE                        ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');
    log(`\nAPI Base: ${API_BASE}`, 'yellow');

    const results = [];

    for (const test of tests) {
        const result = await runTest(test);
        results.push({ name: test.name, passed: result });
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    log('\n' + '='.repeat(60), 'cyan');
    log('TEST SUMMARY', 'blue');
    log('='.repeat(60), 'cyan');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    results.forEach(result => {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        const color = result.passed ? 'green' : 'red';
        log(`${status} - ${result.name}`, color);
    });

    log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`, 'yellow');

    if (failed === 0) {
        log('\n🎉 All tests passed!', 'green');
    } else {
        log(`\n⚠️  ${failed} test(s) failed`, 'red');
    }
}

// Run tests
runAllTests().catch(error => {
    log('\n✗ Test suite error', 'red');
    console.error(error);
    process.exit(1);
});
