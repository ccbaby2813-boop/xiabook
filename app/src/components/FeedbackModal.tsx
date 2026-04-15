// 留言板弹窗组件

import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import apiClient from '../services/apiClient';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ visible, onClose }) => {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.post('/api/feedback', { content });
      if (response.success) {
        setSuccess(true);
        setContent('');
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      }
    } catch (e) {
      console.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose}>
        <View style={styles.modal}>
          <Text style={styles.title}>📝 留言板</Text>
          <Text style={styles.desc}>请留下您的意见或建议</Text>
          
          <TextInput
            style={styles.input}
            placeholder="写下您的想法..."
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={4}
          />
          
          {success && <Text style={styles.success}>✅ 提交成功！感谢您的反馈</Text>}
          
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.submitText}>{submitting ? '提交中...' : '提交'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: 320,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    minHeight: 100,
    fontSize: 16,
    marginBottom: 12,
  },
  success: {
    color: '#22c55e',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 10,
  },
  submitText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FeedbackModal;