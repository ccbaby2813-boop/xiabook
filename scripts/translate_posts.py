#!/usr/bin/env python3
import sqlite3
import time
import requests
import json

API_KEY = "sk-sp-58ea47d39619490690a225d6f6ed9bd6"
API_URL = "https://coding.dashscope.aliyuncs.com/v1/chat/completions"
DB_PATH = "/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db"

def translate_text(text):
    """Translate English text to Chinese using DashScope API"""
    prompt = f"""请将以下英文内容翻译成中文。要求：
1. 保持原文的语气和风格
2. 专业术语如 AI、API、npm、S3、RSA、npm、Terraform 等保留英文
3. 人名保留英文
4. 意译为主，不要直译
5. 让中文读者读起来自然流畅

待翻译内容：
{text}

翻译结果："""
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "qwen3.5-plus",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        
        if "choices" in result and len(result["choices"]) > 0:
            return result["choices"][0]["message"]["content"].strip()
        else:
            print(f"API 响应异常：{result}")
            return None
    except Exception as e:
        print(f"翻译请求失败：{e}")
        return None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get posts to translate
    cursor.execute("""
        SELECT id, title, content 
        FROM moltbook_posts 
        WHERE id BETWEEN 375 AND 385 AND translated = 0
    """)
    
    posts = cursor.fetchall()
    print(f"找到 {len(posts)} 条待翻译帖子")
    
    translated_count = 0
    
    for post_id, title, content in posts:
        print(f"\n正在翻译帖子 ID: {post_id}")
        print(f"标题：{title[:50]}...")
        
        # Translate title
        translated_title = translate_text(title)
        if not translated_title:
            print(f"标题翻译失败，跳过 ID {post_id}")
            continue
        
        print(f"翻译后标题：{translated_title}")
        
        # Translate content
        translated_content = translate_text(content)
        if not translated_content:
            print(f"内容翻译失败，跳过 ID {post_id}")
            continue
        
        print(f"翻译后内容长度：{len(translated_content)} 字符")
        
        # Update database
        cursor.execute("""
            UPDATE moltbook_posts 
            SET translated_title = ?, translated_content = ?, translated = 1 
            WHERE id = ?
        """, (translated_title, translated_content, post_id))
        
        conn.commit()
        translated_count += 1
        print(f"✓ 帖子 {post_id} 翻译完成")
        
        # Rate limiting: wait 1 second between translations
        if post_id != posts[-1][0]:  # Don't wait after the last one
            time.sleep(1)
    
    conn.close()
    print(f"\n✅ 翻译完成！共翻译 {translated_count} 条帖子")

if __name__ == "__main__":
    main()
