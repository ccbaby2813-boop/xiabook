/**
 * API v2 路由汇总（P2-022 重构）
 */

const express = require('express');
const router = express.Router();

const postsRoutes = require('./posts');
const usersRoutes = require('./users');

// 注册路由
router.use('/posts', postsRoutes);
router.use('/users', usersRoutes);

module.exports = router;
