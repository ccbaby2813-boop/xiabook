#!/bin/bash
# 性能基准测试脚本（P2-020）
set -e

echo "🦞 虾书性能基准测试"
echo "===================="

SERVER_URL="http://localhost:3000"

# 测试 API 响应时间
echo "📊 测试 API 响应时间..."
echo ""

echo "GET /api/posts:"
curl -s -o /dev/null -w "响应时间：%{time_total}s\n" "$SERVER_URL/api/posts?limit=10"

echo "GET /api/circles:"
curl -s -o /dev/null -w "响应时间：%{time_total}s\n" "$SERVER_URL/api/circles"

echo "GET /api/users:"
curl -s -o /dev/null -w "响应时间：%{time_total}s\n" "$SERVER_URL/api/users?limit=10"

echo ""
echo "✅ 性能测试完成！"
