/**
 * 🔍 系统验证脚本 - 验证系统性修复的完整性和有效性
 * 可以在微信小程序开发者工具控制台中直接运行
 */

(function() {
  console.log('🔍 ==================== 系统验证开始 ====================');
  
  const verificationResults = {
    memory: { status: 'unknown', details: [] },
    errors: { status: 'unknown', details: [] },
    performance: { status: 'unknown', details: [] },
    codeQuality: { status: 'unknown', details: [] },
    functionality: { status: 'unknown', details: [] },
    overall: { status: 'unknown', score: 0 }
  };

  // 📋 验证1：内存管理
  function verifyMemoryManagement() {
    console.log('🔍 [验证1] 检查内存管理...');
    
    const currentPage = getCurrentPages()[getCurrentPages().length - 1];
    const results = [];
    
    if (!currentPage) {
      results.push('❌ 无法获取当前页面');
      verificationResults.memory.status = 'failed';
      return;
    }
    
    // 检查资源管理器
    if (currentPage.resourceManager) {
      results.push('✅ 资源管理器已集成');
      
      const stats = currentPage.resourceManager.getStats();
      results.push(`📊 当前资源使用: ${stats.total}个 (定时器:${stats.timeouts} 间隔:${stats.intervals} 监听器:${stats.watchers})`);
      
      if (stats.total > 10) {
        results.push('⚠️ 资源使用较多，建议检查');
        verificationResults.memory.status = 'warning';
      } else {
        results.push('✅ 资源使用正常');
        verificationResults.memory.status = 'passed';
      }
    } else {
      results.push('❌ 资源管理器未集成');
      verificationResults.memory.status = 'failed';
    }
    
    // 检查onUnload方法
    if (typeof currentPage.onUnload === 'function') {
      const onUnloadStr = currentPage.onUnload.toString();
      if (onUnloadStr.includes('resourceManager') && onUnloadStr.includes('cleanup')) {
        results.push('✅ onUnload方法已增强');
      } else {
        results.push('⚠️ onUnload方法可能需要增强');
      }
    }
    
    verificationResults.memory.details = results;
    console.log('🔍 [验证1] 内存管理检查完成:', verificationResults.memory.status);
  }

  // 🚨 验证2：错误处理
  function verifyErrorHandling() {
    console.log('🔍 [验证2] 检查错误处理...');
    
    const results = [];
    
    // 检查ErrorHandler是否可用
    try {
      if (typeof require !== 'undefined') {
        const ErrorHandler = require('./utils/error-handler.js');
        if (ErrorHandler && typeof ErrorHandler.handle === 'function') {
          results.push('✅ 错误处理器可用');
          
          const stats = ErrorHandler.getStats();
          results.push(`📊 错误统计: 总计${stats.totalErrors}个错误`);
          
          if (stats.totalErrors > 20) {
            results.push('⚠️ 错误数量较多');
            verificationResults.errors.status = 'warning';
          } else {
            results.push('✅ 错误数量正常');
            verificationResults.errors.status = 'passed';
          }
        } else {
          results.push('❌ 错误处理器不可用');
          verificationResults.errors.status = 'failed';
        }
      } else {
        results.push('⚠️ 无法检测错误处理器（require不可用）');
        verificationResults.errors.status = 'warning';
      }
    } catch (error) {
      results.push('❌ 错误处理器检测失败: ' + error.message);
      verificationResults.errors.status = 'failed';
    }
    
    verificationResults.errors.details = results;
    console.log('🔍 [验证2] 错误处理检查完成:', verificationResults.errors.status);
  }

  // ⚡ 验证3：性能优化
  function verifyPerformance() {
    console.log('🔍 [验证3] 检查性能优化...');
    
    const results = [];
    const startTime = performance.now();
    
    // 检查日志输出量
    let logCount = 0;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    
    console.log = function(...args) {
      logCount++;
      return originalConsoleLog.apply(console, args);
    };
    
    console.error = function(...args) {
      logCount++;
      return originalConsoleError.apply(console, args);
    };
    
    // 模拟一些操作
    setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        console.log(`测试日志 ${i}`);
      }
    }, 100);
    
    setTimeout(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 恢复console方法
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      
      results.push(`📊 性能测试耗时: ${duration.toFixed(2)}ms`);
      results.push(`📊 日志输出数量: ${logCount}`);
      
      if (duration > 100) {
        results.push('⚠️ 性能测试耗时较长');
        verificationResults.performance.status = 'warning';
      } else {
        results.push('✅ 性能表现良好');
        verificationResults.performance.status = 'passed';
      }
      
      if (logCount > 50) {
        results.push('⚠️ 日志输出量较大');
      } else {
        results.push('✅ 日志输出量正常');
      }
      
      verificationResults.performance.details = results;
      console.log('🔍 [验证3] 性能优化检查完成:', verificationResults.performance.status);
      
      // 继续下一个验证
      verifyCodeQuality();
    }, 500);
  }

  // 🧹 验证4：代码质量
  function verifyCodeQuality() {
    console.log('🔍 [验证4] 检查代码质量...');
    
    const results = [];
    const currentPage = getCurrentPages()[getCurrentPages().length - 1];
    
    if (!currentPage) {
      results.push('❌ 无法获取当前页面');
      verificationResults.codeQuality.status = 'failed';
      return;
    }
    
    // 检查页面方法数量
    const methodCount = Object.keys(currentPage).filter(key => 
      typeof currentPage[key] === 'function'
    ).length;
    
    results.push(`📊 页面方法数量: ${methodCount}`);
    
    if (methodCount > 50) {
      results.push('⚠️ 页面方法过多，建议模块化');
      verificationResults.codeQuality.status = 'warning';
    } else {
      results.push('✅ 页面方法数量合理');
      verificationResults.codeQuality.status = 'passed';
    }
    
    // 检查数据结构
    const dataKeys = Object.keys(currentPage.data || {});
    results.push(`📊 页面数据字段数量: ${dataKeys.length}`);
    
    if (dataKeys.length > 30) {
      results.push('⚠️ 页面数据字段较多');
    } else {
      results.push('✅ 页面数据结构合理');
    }
    
    // 检查是否有测试方法
    const hasTestMethods = Object.keys(currentPage).some(key => 
      key.includes('test') || key.includes('Test')
    );
    
    if (hasTestMethods) {
      results.push('✅ 包含测试方法');
    } else {
      results.push('⚠️ 缺少测试方法');
    }
    
    verificationResults.codeQuality.details = results;
    console.log('🔍 [验证4] 代码质量检查完成:', verificationResults.codeQuality.status);
    
    // 继续下一个验证
    verifyFunctionality();
  }

  // 🔧 验证5：功能完整性
  function verifyFunctionality() {
    console.log('🔍 [验证5] 检查功能完整性...');
    
    const results = [];
    const currentPage = getCurrentPages()[getCurrentPages().length - 1];
    
    if (!currentPage) {
      results.push('❌ 无法获取当前页面');
      verificationResults.functionality.status = 'failed';
      generateFinalReport();
      return;
    }
    
    // 检查核心功能
    const coreFunctions = [
      'sendMessage', 'fetchMessages', 'startMessageListener',
      'addSystemMessage', 'updateDynamicTitle'
    ];
    
    let availableFunctions = 0;
    coreFunctions.forEach(funcName => {
      if (typeof currentPage[funcName] === 'function') {
        availableFunctions++;
        results.push(`✅ ${funcName} 可用`);
      } else {
        results.push(`❌ ${funcName} 不可用`);
      }
    });
    
    const functionRatio = availableFunctions / coreFunctions.length;
    results.push(`📊 核心功能完整性: ${(functionRatio * 100).toFixed(1)}%`);
    
    if (functionRatio >= 0.8) {
      results.push('✅ 核心功能基本完整');
      verificationResults.functionality.status = 'passed';
    } else if (functionRatio >= 0.5) {
      results.push('⚠️ 部分核心功能缺失');
      verificationResults.functionality.status = 'warning';
    } else {
      results.push('❌ 核心功能严重缺失');
      verificationResults.functionality.status = 'failed';
    }
    
    // 检查修复标记
    const pageStr = currentPage.toString ? currentPage.toString() : '';
    const fixVersions = ['v1.3.45', 'HOTFIX', '系统修复'];
    const hasFixMarkers = fixVersions.some(version => 
      JSON.stringify(currentPage).includes(version)
    );
    
    if (hasFixMarkers) {
      results.push('✅ 包含修复标记');
    } else {
      results.push('⚠️ 缺少修复标记');
    }
    
    verificationResults.functionality.details = results;
    console.log('🔍 [验证5] 功能完整性检查完成:', verificationResults.functionality.status);
    
    // 生成最终报告
    generateFinalReport();
  }

  // 📊 生成最终报告
  function generateFinalReport() {
    console.log('🔍 [生成报告] 计算总体得分...');
    
    const statusScores = {
      'passed': 100,
      'warning': 70,
      'failed': 0,
      'unknown': 0
    };
    
    const weights = {
      memory: 25,
      errors: 20,
      performance: 20,
      codeQuality: 15,
      functionality: 20
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.keys(weights).forEach(category => {
      const status = verificationResults[category].status;
      const score = statusScores[status] || 0;
      const weight = weights[category];
      
      totalScore += score * weight;
      totalWeight += weight;
    });
    
    const overallScore = Math.round(totalScore / totalWeight);
    
    // 确定总体状态
    let overallStatus = 'failed';
    if (overallScore >= 85) {
      overallStatus = 'excellent';
    } else if (overallScore >= 70) {
      overallStatus = 'good';
    } else if (overallScore >= 50) {
      overallStatus = 'fair';
    }
    
    verificationResults.overall = {
      status: overallStatus,
      score: overallScore
    };
    
    // 输出最终报告
    console.log('🔍 ==================== 系统验证报告 ====================');
    console.log(`📊 总体得分: ${overallScore}/100 (${overallStatus})`);
    console.log('');
    
    Object.keys(verificationResults).forEach(category => {
      if (category === 'overall') return;
      
      const result = verificationResults[category];
      const emoji = {
        'passed': '✅',
        'warning': '⚠️',
        'failed': '❌',
        'unknown': '❓'
      }[result.status] || '❓';
      
      console.log(`${emoji} ${category.toUpperCase()}: ${result.status}`);
      result.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
      console.log('');
    });
    
    // 提供建议
    console.log('🔍 ==================== 修复建议 ====================');
    
    if (overallScore >= 85) {
      console.log('🎉 系统修复效果良好！建议继续保持。');
    } else if (overallScore >= 70) {
      console.log('👍 系统修复基本完成，还有改进空间。');
    } else if (overallScore >= 50) {
      console.log('⚠️ 系统修复部分完成，建议继续优化。');
    } else {
      console.log('❌ 系统修复不充分，需要进一步处理。');
    }
    
    // 具体建议
    const suggestions = [];
    
    if (verificationResults.memory.status !== 'passed') {
      suggestions.push('• 完善资源管理器集成');
      suggestions.push('• 增强页面卸载清理逻辑');
    }
    
    if (verificationResults.errors.status !== 'passed') {
      suggestions.push('• 集成统一错误处理机制');
      suggestions.push('• 减少错误发生频率');
    }
    
    if (verificationResults.performance.status !== 'passed') {
      suggestions.push('• 优化日志输出量');
      suggestions.push('• 提升操作响应速度');
    }
    
    if (verificationResults.codeQuality.status !== 'passed') {
      suggestions.push('• 进行代码模块化重构');
      suggestions.push('• 添加更多测试方法');
    }
    
    if (verificationResults.functionality.status !== 'passed') {
      suggestions.push('• 修复缺失的核心功能');
      suggestions.push('• 添加修复版本标记');
    }
    
    if (suggestions.length > 0) {
      console.log('建议采取以下措施：');
      suggestions.forEach(suggestion => console.log(suggestion));
    }
    
    console.log('🔍 ==================== 验证完成 ====================');
    
    // 返回结果供进一步处理
    return verificationResults;
  }

  // 开始验证流程
  try {
    verifyMemoryManagement();
    verifyErrorHandling();
    verifyPerformance(); // 这个会异步执行后续验证
  } catch (error) {
    console.error('🔍 [验证错误] 系统验证过程中出现错误:', error);
    
    verificationResults.overall = {
      status: 'error',
      score: 0,
      error: error.message
    };
    
    generateFinalReport();
  }

})();