<?php
/**
 * Plugin Name: AI Autopilot
 * Description: Enables SEO metadata synchronization via REST API for RankMath.
 * Version: 1.0.0
 * Author: AI Autopilot
 * License: GPL-2.0+
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Register Meta Keys for REST API
 * This allows the SaaS to send 'rank_math_title', 'rank_math_description', 
 * and 'rank_math_focus_keyword' in the post 'meta' object.
 */
add_action('init', function() {
    $keys = [
        'rank_math_title'         => 'string',
        'rank_math_description'   => 'string',
        'rank_math_focus_keyword' => 'string'
    ];

    foreach ($keys as $key => $type) {
        register_post_meta('post', $key, [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => $type,
            'auth_callback' => function() {
                // If we reach this via an authenticated REST request, 
                // the user already has permission to edit the post.
                return current_user_can('edit_posts');
            }
        ]);
    }
});

/**
 * Sync logic: 
 * Catch updates to our public keys and sync them to RankMath's internal hidden keys.
 */
function ai_autopilot_sync_rankmath_meta($meta_id, $object_id, $meta_key, $_meta_value) {
    $synced_keys = [
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword'
    ];

    if (in_array($meta_key, $synced_keys)) {
        // Debugging log (check WordPress error_log)
        error_log("AI Autopilot: Syncing $meta_key for Post $object_id: " . substr($_meta_value, 0, 50) . "...");
        
        // Sync to the hidden key used by RankMath
        update_post_meta($object_id, '_' . $meta_key, $_meta_value);
    }
}

add_action('added_post_meta', 'ai_autopilot_sync_rankmath_meta', 10, 4);
add_action('updated_post_meta', 'ai_autopilot_sync_rankmath_meta', 10, 4);
