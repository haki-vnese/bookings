<?php
/**
 * Plugin Name: Nail Dashboard
 * Description: Frontend operational dashboard for nail salon admin workflows.
 * Version: 0.1.0
 * Author: Nail Salon Team
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ND_PLUGIN_VERSION', '0.1.0');
define('ND_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ND_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once ND_PLUGIN_DIR . 'includes/class-nd-router.php';
require_once ND_PLUGIN_DIR . 'includes/class-nd-auth.php';

function nd_activate_plugin() {
    ND_Router::registerRewrite();
    flush_rewrite_rules();
}

function nd_deactivate_plugin() {
    flush_rewrite_rules();
}

register_activation_hook(__FILE__, 'nd_activate_plugin');
register_deactivation_hook(__FILE__, 'nd_deactivate_plugin');

final class ND_Plugin {
    public function __construct() {
        add_action('admin_init', [$this, 'registerSettings']);
        add_action('admin_menu', [$this, 'registerSettingsPage']);
        add_action('plugins_loaded', [$this, 'boot']);
    }

    public function boot() {
        ND_Router::init();
    }

    public function registerSettings() {
        register_setting('nd_settings', 'nd_api_base_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => 'http://localhost:8000/api',
        ]);
    }

    public function registerSettingsPage() {
        add_options_page(
            'Nail Dashboard Settings',
            'Nail Dashboard',
            'manage_options',
            'nd-settings',
            [$this, 'renderSettingsPage']
        );
    }

    public function renderSettingsPage() {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1>Nail Dashboard Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('nd_settings'); ?>
                <?php do_settings_sections('nd_settings'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nd_api_base_url">Backend API Base URL</label></th>
                        <td>
                            <input
                                type="url"
                                class="regular-text"
                                name="nd_api_base_url"
                                id="nd_api_base_url"
                                value="<?php echo esc_attr(get_option('nd_api_base_url', 'http://localhost:8000/api')); ?>"
                            />
                            <p class="description">Example: https://api.yourdomain.com/api</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('Save Settings'); ?>
            </form>
        </div>
        <?php
    }
}

new ND_Plugin();
