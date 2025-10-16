import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 竹笛音乐播放器 - 根据简谱生成音乐
 * 解析《荒》简谱并生成完整的MP3音频 C调，每分钟60拍，速度4（每小节4拍）/4（4分音符为一拍）
 */
class FluteMusicPlayer {
    constructor() {
        this.tempDir = './temp_audio';
        this.outputDir = './output';
        
        // 确保目录存在
        fs.ensureDirSync(this.tempDir);
        fs.ensureDirSync(this.outputDir);
        
        // 音符映射
        this.noteMapping = {
            '1': '1.wav', '2': '2.wav', '3': '3.wav', '4': '4.wav',
            '5': '5.wav', '6': '6.wav', '7': '7.wav'
        };
        
        // 八度映射
        this.octaveMapping = {
            'low': 'low',      // 低音 (下点)
            'mid': 'mid',      // 中音 (无标记)
            'high': 'high'     // 高音 (上点)
        };
    }

    /**
     * 解析《荒》的简谱数据
     * 根据图片中的简谱转换为数字化格式
     */
    getSheetMusic() {
      // 根据简谱图片解析的《荒》曲谱
      // 格式: [音符, 八度, 时值（秒）, 是否连音]
      return [            
        ["rest", "", 0.5, false], ["1", "mid", 0.5, false], ["7", "low", 0.5, false], ["1", "mid", 0.5, false], ["6", "low", 1.0, false], ["6", "low", 0.5, false], ["6", "mid", 0.5, false], 
        ["5", "mid", 0.5, false], ["2", "mid", 0.5, false], ["2", "mid", 0.5, false], ["4", "mid", 0.5, false], ["3", "mid", 0.5, false], ["3", "mid", 0.5, false], ["2", "mid", 0.5, false], ["2", "mid", 0.25, true], ["3", "mid", 0.25, false], 
        ["1", "mid", 1, false], ["1", "mid", 0.5, false], ["7", "low", 0.5, false], ["6", "low", 1.0, false], ["6", "low", 0.5, false], ["6", "mid", 0.5, false], 
        ["5", "mid", 0.5, false], ["2", "mid", 0.5, false], ["2", "mid", 0.5, false], ["4", "mid", 0.5, false], ["3", "mid", 2.0, false], 
        ["rest", "", 0.5, false], ["1", "mid", 0.5, false], ["7", "low", 0.5, false], ["1", "mid", 0.5, false], ["6", "low", 1.0, false], ["6", "low", 0.5, false], ["6", "mid", 0.5, false],
        ["5", "mid", 0.5, false], ["2", "mid", 0.5, false], ["2", "mid", 0.5, false], ["4", "mid", 0.5, false], ["3", "mid", 0.5, false], ["2", "mid", 0.5, false], ["2", "mid", 0.25, true], ["3", "mid", 0.25, false],
        ["1", "mid", 1, false], ["1", "mid", 0.5, false], ["7", "low", 0.5, false], ["6", "low", 1.0, false], ["6", "low", 0.5, false], ["3", "mid", 1, false], 
        ["2", "mid", 0.5, false], ["2", "mid", 0.25, false], ["3", "mid", 0.25, false], ["5", "low", 0.5, false], ["6", "low", 0.5, true], ["6", "low", 1, false]
      ];
    }

    /**
     * 获取音频文件路径
     */
    getAudioPath(note, octave) {
        if (note === 'rest') {
            return null; // 休止符
        }
        
        const fileName = this.noteMapping[note];
        const octaveDir = this.octaveMapping[octave];
        
        if (!fileName || !octaveDir) {
            throw new Error(`未找到音符 ${note} 在 ${octave} 八度的音频文件`);
        }
        
        return path.join(__dirname, octaveDir, fileName);
    }

    /**
     * 创建休止符音频（静音）
     */
    async createSilence(duration) {
        const silencePath = path.join(this.tempDir, `silence_${Date.now()}.wav`);
        
        return new Promise((resolve, reject) => {
            // 使用现有的音频文件作为模板创建静音
            const templateFile = path.join(__dirname, 'mid', '1.wav');
            
            if (!fs.existsSync(templateFile)) {
                reject(new Error('找不到模板音频文件'));
                return;
            }
            
            ffmpeg(templateFile)
                .duration(duration)
                .audioFilters([
                    'volume=0',           // 设置音量为0实现静音
                    'aformat=sample_rates=44100:channel_layouts=stereo'  // 确保音频格式一致
                ])
                .audioCodec('pcm_s16le')
                .output(silencePath)
                .on('end', () => resolve(silencePath))
                .on('error', reject)
                .run();
        });
    }

    /**
     * 调整音频时长并添加淡入淡出效果
     */
    async adjustAudioDuration(inputPath, duration, addFade = true) {
        const outputPath = path.join(this.tempDir, `adjusted_${Date.now()}.wav`);
        
        return new Promise((resolve, reject) => {
            let command = ffmpeg(inputPath)
                .duration(duration);
            
            // 添加淡入淡出效果，避免音频切换时的卡顿
            if (addFade && duration > 0.2) {
                const fadeTime = Math.min(0.1, duration / 4); // 淡入淡出时间，最多为音频时长的1/4
                command = command.audioFilters([
                    `afade=t=in:ss=0:d=${fadeTime}`,      // 淡入
                    `afade=t=out:st=${duration - fadeTime}:d=${fadeTime}`, // 淡出
                    'highpass=f=20',    // 高通滤波器，去除低频噪音
                    'lowpass=f=15000'   // 低通滤波器，去除高频噪音
                ]);
            } else if (addFade) {
                // 对于短音频，使用更短的淡入淡出时间
                const fadeTime = duration / 6;
                command = command.audioFilters([
                    `afade=t=in:ss=0:d=${fadeTime}`,
                    `afade=t=out:st=${duration - fadeTime}:d=${fadeTime}`
                ]);
            }
            
            command
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .run();
        });
    }

    /**
     * 合并所有音频片段（使用crossfade平滑过渡）
     */
    async mergeAudioSegments(segments) {
        const outputPath = path.join(this.outputDir, 'huang_flute_music.mp3');
        
        return new Promise((resolve, reject) => {
            let command = ffmpeg();
            
            // 添加所有输入文件
            segments.forEach(segment => {
                command = command.input(segment);
            });
            
            if (segments.length === 1) {
                // 如果只有一个音频文件，直接输出
                command
                    .output(outputPath)
                    .on('end', () => {
                        console.log('🎵 MP3文件生成完成:', outputPath);
                        resolve(outputPath);
                    })
                    .on('error', (err) => {
                        console.error('❌ 合并音频时发生错误:', err);
                        reject(err);
                    })
                    .run();
                return;
            }
            
            // 使用crossfade进行平滑过渡
            let filterComplex = '';
            let previousOutput = '[0:0]';
            
            for (let i = 1; i < segments.length; i++) {
                const currentInput = `[${i}:0]`;
                const outputLabel = i === segments.length - 1 ? '[out]' : `[tmp${i}]`;
                
                // 为每个过渡处添加crossfade效果
                // crossfade持续时间设置为0.05秒，既能平滑过渡又不会太明显
                filterComplex += `${previousOutput}${currentInput}acrossfade=d=0.05:c1=tri:c2=tri${outputLabel};`;
                previousOutput = outputLabel;
            }
            
            command
                .complexFilter(filterComplex.slice(0, -1)) // 移除最后一个分号
                .map('[out]')
                .audioCodec('libmp3lame')
                .audioBitrate(192)
                .audioChannels(2)
                .audioFrequency(44100)
                .output(outputPath)
                .on('end', () => {
                    console.log('🎵 MP3文件生成完成:', outputPath);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('❌ 合并音频时发生错误:', err);
                    reject(err);
                })
                .run();
        });
    }

    /**
     * 主函数：根据简谱生成音乐
     */
    async generateMusic() {
        try {
            console.log('🎼 开始根据简谱《荒》生成音乐...');
            
            const sheetMusic = this.getSheetMusic();
            const audioSegments = [];
            
            // 处理每个音符
            for (let i = 0; i < sheetMusic.length; i++) {
                const [note, octave, duration, isLegato] = sheetMusic[i];
                
                console.log(`🎵 处理音符: ${note}${octave ? `(${octave})` : ''} - 时长: ${duration}秒，是否连音: ${isLegato}`);
                
                let segmentPath;
                
                if (note === 'rest') {
                    // 处理休止符（不需要淡入淡出）
                    segmentPath = await this.createSilence(duration);
                } else {
                    // 处理普通音符
                    const audioPath = this.getAudioPath(note, octave);
                    
                    if (!fs.existsSync(audioPath)) {
                        console.warn(`⚠️  音频文件不存在: ${audioPath}, 跳过此音符`);
                        continue;
                    }
                    
                    // 调整音频时长并添加淡入淡出效果
                    segmentPath = await this.adjustAudioDuration(audioPath, duration, true);
                }
                
                audioSegments.push(segmentPath);
            }
            
            console.log(`📝 总共处理了 ${audioSegments.length} 个音频片段`);
            
            // 合并所有音频片段
            const finalOutputPath = await this.mergeAudioSegments(audioSegments);
            
            // 清理临时文件
            await this.cleanup();
            
            console.log('✅ 音乐生成完成!');
            console.log(`🎧 输出文件: ${finalOutputPath}`);
            
            return finalOutputPath;
            
        } catch (error) {
            console.error('❌ 生成音乐时发生错误:', error);
            throw error;
        }
    }

    /**
     * 清理临时文件
     */
    async cleanup() {
        try {
            await fs.remove(this.tempDir);
            console.log('🧹 临时文件清理完成');
        } catch (error) {
            console.warn('⚠️  清理临时文件时发生错误:', error);
        }
    }
}

// 导出模块
export default FluteMusicPlayer;

// 判断当前模块是否被直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
    const player = new FluteMusicPlayer();
    player.generateMusic().catch(console.error);
}
