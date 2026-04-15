#!/bin/bash
# 虾书服务器监控脚本
# 输出 JSON 格式，可被后台调用

# 获取 CPU 使用率
get_cpu_usage() {
    # 使用 top 命令获取 CPU 使用率
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if [ -z "$cpu_usage" ]; then
        # 备用方法：使用 /proc/stat
        cpu_usage=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}')
    fi
    printf "%.1f" "$cpu_usage"
}

# 获取内存使用率
get_memory_usage() {
    mem_info=$(free | grep Mem)
    total=$(echo "$mem_info" | awk '{print $2}')
    used=$(echo "$mem_info" | awk '{print $3}')
    if [ "$total" -gt 0 ]; then
        usage=$(echo "scale=1; $used * 100 / $total" | bc)
        printf "%.1f" "$usage"
    else
        echo "0.0"
    fi
}

# 获取磁盘使用率
get_disk_usage() {
    disk_usage=$(df -h / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
    printf "%d" "$disk_usage"
}

# 获取 Node.js 进程状态
get_nodejs_status() {
    node_pid=$(pgrep -f "node src/server" | head -1)
    if [ -n "$node_pid" ]; then
        # 获取进程详细信息
        node_mem=$(ps -p "$node_pid" -o rss= | awk '{printf "%.1f", $1/1024}')  # MB
        node_cpu=$(ps -p "$node_pid" -o %cpu= | awk '{printf "%.1f", $1}')
        echo "{\"running\": true, \"pid\": $node_pid, \"memory_mb\": $node_mem, \"cpu\": $node_cpu}"
    else
        echo "{\"running\": false, \"pid\": null, \"memory_mb\": 0, \"cpu\": 0}"
    fi
}

# 服务健康检查
health_check() {
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/api/health 2>/dev/null)
    if [ "$response" = "200" ]; then
        echo "{\"status\": \"healthy\", \"http_code\": 200}"
    else
        echo "{\"status\": \"unhealthy\", \"http_code\": ${response:-0}}"
    fi
}

# 获取系统运行时间
get_uptime() {
    uptime_seconds=$(cat /proc/uptime | awk '{print int($1)}')
    uptime_days=$((uptime_seconds / 86400))
    uptime_hours=$(((uptime_seconds % 86400) / 3600))
    uptime_minutes=$(((uptime_seconds % 3600) / 60))
    echo "{\"days\": $uptime_days, \"hours\": $uptime_hours, \"minutes\": $uptime_minutes}"
}

# 主函数：输出 JSON
main() {
    timestamp=$(date -Iseconds)
    
    cpu_usage=$(get_cpu_usage)
    memory_usage=$(get_memory_usage)
    disk_usage=$(get_disk_usage)
    nodejs_status=$(get_nodejs_status)
    health=$(health_check)
    uptime_info=$(get_uptime)
    
    cat <<EOF
{
  "timestamp": "$timestamp",
  "system": {
    "cpu_usage": $cpu_usage,
    "memory_usage": $memory_usage,
    "disk_usage": $disk_usage,
    "uptime": $uptime_info
  },
  "nodejs": $nodejs_status,
  "health": $health
}
EOF
}

main
