<?php

if (!defined('ABSPATH')) {
    exit;
}

class ND_Router {
    const ROUTE_VAR = 'nd_dashboard';

    public static function init() {
        add_action('init', [__CLASS__, 'registerRewrite']);
        add_filter('query_vars', [__CLASS__, 'registerQueryVar']);
        add_action('template_redirect', [__CLASS__, 'renderDashboardRoute']);
        add_shortcode('nail_dashboard', [__CLASS__, 'renderShortcode']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueueAssets']);
        add_filter('script_loader_tag', [__CLASS__, 'markAppScriptAsModule'], 10, 3);
    }

    public static function registerRewrite() {
        add_rewrite_rule('^dashboard/?$', 'index.php?' . self::ROUTE_VAR . '=1', 'top');
    }

    public static function registerQueryVar($vars) {
        $vars[] = self::ROUTE_VAR;
        return $vars;
    }

    public static function renderDashboardRoute() {
        $isDashboard = get_query_var(self::ROUTE_VAR);
        if (!$isDashboard) {
            return;
        }

        status_header(200);
        nocache_headers();

        echo self::renderShell();
        exit;
    }

    public static function renderShortcode() {
        return self::renderShell();
    }

    public static function enqueueAssets() {
        global $post;

        $hasShortcode = is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'nail_dashboard');
        $isDashboardRoute = (bool) get_query_var(self::ROUTE_VAR);

        if (!$hasShortcode && !$isDashboardRoute) {
            return;
        }

        wp_enqueue_style(
            'nd-dashboard-style',
            ND_PLUGIN_URL . 'assets/css/dashboard.css',
            [],
            ND_PLUGIN_VERSION
        );

        wp_enqueue_script(
            'nd-dashboard-app',
            ND_PLUGIN_URL . 'assets/js/app.js',
            [],
            ND_PLUGIN_VERSION,
            true
        );

        wp_localize_script('nd-dashboard-app', 'ND_CONFIG', [
            'apiBaseUrl' => esc_url_raw(get_option('nd_api_base_url', 'http://localhost:8000/api')),
            'dashboardUrl' => esc_url(home_url('/dashboard')),
            'timeZone' => wp_timezone_string() ?: 'UTC',
        ]);
    }

    public static function markAppScriptAsModule($tag, $handle, $src) {
        if ($handle !== 'nd-dashboard-app') {
            return $tag;
        }

        return '<script type="module" src="' . esc_url($src) . '"></script>';
    }

    private static function renderShell() {
        ob_start();
        ?>
        <!doctype html>
        <html <?php language_attributes(); ?>>
        <head>
            <meta charset="<?php bloginfo('charset'); ?>" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Nail Dashboard</title>
            <?php wp_head(); ?>
        </head>
        <body <?php body_class('nd-body'); ?>>
            <div id="nd-app"></div>
            <?php wp_footer(); ?>
        </body>
        </html>
        <?php
        return (string) ob_get_clean();
    }
}
