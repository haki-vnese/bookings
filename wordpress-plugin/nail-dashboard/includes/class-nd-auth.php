<?php

if (!defined('ABSPATH')) {
    exit;
}

class ND_Auth {
    public static function normalizeRole($role) {
        $allowed = ['superuser', 'admin', 'staff'];
        $role = strtolower(trim((string) $role));
        return in_array($role, $allowed, true) ? $role : null;
    }

    public static function canManageUsers($role) {
        $normalized = self::normalizeRole($role);
        return in_array($normalized, ['superuser', 'admin'], true);
    }

    public static function isDashboardRole($role) {
        return self::normalizeRole($role) !== null;
    }
}
