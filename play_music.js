#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 简单的音频播放脚本
 * 播放生成的《荒》竹笛音乐
 */

const musicFile = path.join(__dirname, 'output', 'huang_flute_music.mp3');

console.log('🎵《荒》竹笛演奏播放器');
console.log('='.repeat(30));

// 检查文件是否存在
if (!fs.existsSync(musicFile)) {
    console.error('❌ 音乐文件不存在:', musicFile);
    console.log('💡 请先运行: node music_player.js 来生成音乐');
    process.exit(1);
}

// 获取文件信息
const stats = fs.statSync(musicFile);
const fileSizeKB = (stats.size / 1024).toFixed(2);

console.log(`📁 文件: ${path.basename(musicFile)}`);
console.log(`📏 大小: ${fileSizeKB} KB`);
console.log(`⏱️  时长: 约50秒`);
console.log('');

// 尝试使用不同的播放器
const players = [
    { command: 'afplay', args: [musicFile], name: 'macOS内置播放器' },
    { command: 'mpg123', args: ['-q', musicFile], name: 'mpg123' },
    { command: 'ffplay', args: ['-nodisp', '-autoexit', musicFile], name: 'FFplay' }
];

function tryPlay(playerIndex = 0) {
    if (playerIndex >= players.length) {
        console.log('❌ 未找到可用的音频播放器');
        console.log('💡 您可以手动打开文件:', musicFile);
        return;
    }
    
    const player = players[playerIndex];
    console.log(`🎧 尝试使用 ${player.name} 播放...`);
    
    const playProcess = spawn(player.command, player.args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    playProcess.on('error', (err) => {
        console.log(`⚠️  ${player.name} 不可用`);
        tryPlay(playerIndex + 1);
    });
    
    playProcess.on('close', (code) => {
        if (code === 0) {
            console.log('✅ 播放完成!');
        } else {
            console.log(`⚠️  播放器退出 (代码: ${code})`);
            tryPlay(playerIndex + 1);
        }
    });
    
    // 捕获Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n⏹️  播放已停止');
        playProcess.kill();
        process.exit(0);
    });
    
    if (playProcess.pid) {
        console.log('▶️  正在播放... (按 Ctrl+C 停止)');
        console.log('');
        console.log('🎼 曲谱信息:');
        console.log('   曲名: 《荒》');
        console.log('   乐器: 竹笛');
        console.log('   调式: C调');
        console.log('   音符: 84个音符片段');
        console.log('   特色: 包含气音、颤音、混响效果');
    }
}

// 开始播放
tryPlay();
