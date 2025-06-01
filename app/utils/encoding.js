/**
 * 安全编码工具函数
 * 解决btoa()不支持Unicode字符的问题
 */

/**
 * 安全的Base64编码（支持Unicode）
 * @param {String} str - 要编码的字符串
 * @returns {String} Base64编码后的字符串
 */
function safeBase64Encode(str) {
  try {
    // 使用TextEncoder将Unicode字符串转换为UTF-8字节
    if (typeof TextEncoder !== 'undefined') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
      return btoa(binary);
    } else {
      // 兼容旧环境，使用encodeURIComponent + escape的方式
      return btoa(unescape(encodeURIComponent(str)));
    }
  } catch (error) {
    console.error('Base64编码失败:', error);
    // 降级方案：直接返回原字符串
    return str;
  }
}

/**
 * 安全的Base64解码（支持Unicode）
 * @param {String} base64Str - Base64编码的字符串
 * @returns {String} 解码后的字符串
 */
function safeBase64Decode(base64Str) {
  try {
    // 使用TextDecoder将UTF-8字节转换为Unicode字符串
    if (typeof TextDecoder !== 'undefined') {
      const binary = atob(base64Str);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decoder = new TextDecoder();
      return decoder.decode(bytes);
    } else {
      // 兼容旧环境
      return decodeURIComponent(escape(atob(base64Str)));
    }
  } catch (error) {
    console.error('Base64解码失败:', error);
    // 降级方案：直接返回原字符串
    return base64Str;
  }
}

/**
 * 安全的URL编码（替代encodeURIComponent）
 * @param {String} str - 要编码的字符串
 * @returns {String} 编码后的字符串
 */
function safeEncodeURIComponent(str) {
  try {
    return encodeURIComponent(str);
  } catch (error) {
    console.error('URL编码失败:', error);
    // 手动编码中文字符
    return str.replace(/[\u4e00-\u9fff]/g, function(match) {
      return encodeURIComponent(match);
    });
  }
}

/**
 * 安全的URL解码（替代decodeURIComponent）
 * @param {String} str - 要解码的字符串
 * @returns {String} 解码后的字符串
 */
function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch (error) {
    console.error('URL解码失败:', error);
    // 降级方案：直接返回原字符串
    return str;
  }
}

/**
 * 安全的昵称编码（专门用于处理用户昵称）
 * @param {String} nickname - 用户昵称
 * @returns {String} 编码后的昵称
 */
function safeEncodeNickname(nickname) {
  if (!nickname) return '朋友';
  
  try {
    // 优先使用安全的URL编码
    return safeEncodeURIComponent(nickname);
  } catch (error) {
    console.error('昵称编码失败:', error);
    // 降级方案：直接返回处理过的昵称
    return nickname.replace(/[<>&"']/g, ''); // 移除可能的危险字符
  }
}

/**
 * 安全的昵称解码（专门用于处理用户昵称）
 * @param {String} encodedNickname - 编码后的昵称
 * @returns {String} 解码后的昵称
 */
function safeDecodeNickname(encodedNickname) {
  if (!encodedNickname) return '朋友';
  
  try {
    return safeDecodeURIComponent(encodedNickname);
  } catch (error) {
    console.error('昵称解码失败:', error);
    // 降级方案：直接返回原字符串
    return encodedNickname;
  }
}

module.exports = {
  safeBase64Encode,
  safeBase64Decode,
  safeEncodeURIComponent,
  safeDecodeURIComponent,
  safeEncodeNickname,
  safeDecodeNickname
}; 