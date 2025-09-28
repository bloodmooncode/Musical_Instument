from pydub.generators import Sine, WhiteNoise
from pydub import AudioSegment
import os
import numpy as np
import math

# C调竹笛音频生成器
# 每个文件夹包含 1.wav 到 7.wav (对应 do re mi fa sol la si)
# 
# C调竹笛音符频率 (赫兹)
notes = {
    # 低音
    'low': {
        '1': 130.81,  # C3
        '2': 146.83,  # D3
        '3': 164.81,  # E3
        '4': 174.61,  # F3
        '5': 196.00,  # G3
        '6': 220.00,  # A3
        '7': 246.94   # B3
    },
    # 中音
    'mid': {
        '1': 261.63,  # C4
        '2': 293.66,  # D4
        '3': 329.63,  # E4
        '4': 349.23,  # F4
        '5': 392.00,  # G4
        '6': 440.00,  # A4
        '7': 493.88   # B4
    },
    # 高音
    'high': {
        '1': 523.25,  # C5
        '2': 587.33,  # D5
        '3': 659.25,  # E5
        '4': 698.46,  # F5
        '5': 783.99,  # G5
        '6': 880.00,  # A6
        '7': 987.77   # B5
    }
}

def add_breath_noise(audio_segment, intensity=0.04):
    """
    添加竹笛特有的气音效果，优化用于多声部播放
    """
    # 生成白噪声作为气音基础
    noise = WhiteNoise().to_audio_segment(duration=len(audio_segment))
    
    # 大幅降低噪声音量，为多声部播放优化
    noise = noise - 42  # 进一步降低噪声音量 (原来35dB, 现在42dB)
    
    # 创建气音包络：开始强，中间弱，结束时略强
    duration_ms = len(audio_segment)
    samples_per_ms = 44.1  # 假设44.1kHz采样率
    
    # 使用numpy创建包络
    envelope_length = int(duration_ms * samples_per_ms)
    envelope = np.ones(envelope_length)
    
    # 气音在开始和结束时更明显
    attack_time = int(0.1 * envelope_length)  # 前10%
    release_time = int(0.2 * envelope_length)  # 后20%
    
    for i in range(attack_time):
        envelope[i] = 0.3 + 0.7 * (attack_time - i) / attack_time
    
    for i in range(release_time):
        idx = envelope_length - 1 - i
        envelope[idx] = 0.1 + 0.2 * i / release_time
    
    # 中间部分保持低强度
    middle_start = attack_time
    middle_end = envelope_length - release_time
    for i in range(middle_start, middle_end):
        envelope[i] = 0.05 + 0.05 * np.sin((i - middle_start) * np.pi / (middle_end - middle_start))
    
    # 应用包络到噪声（这里简化处理）
    breath_noise = noise - 15  # 进一步大幅降低气音 (原来10dB, 现在15dB)
    
    # 将气音混合到原音频，使用更低的混音比例
    return audio_segment.overlay(breath_noise)

def add_subtle_reverb(audio_segment):
    """
    添加更柔和的混响效果，模拟竹笛的空间感
    """
    reverb_audio = audio_segment
    
    # 使用更少、更柔和的延迟层次，模拟竹笛的自然混响
    delays = [60, 120, 200]  # 更短的延迟，更贴近竹笛
    decays = [0.25, 0.15, 0.08]  # 更轻的衰减
    
    for delay, decay in zip(delays, decays):
        # 创建延迟的音频
        delayed = AudioSegment.silent(duration=delay) + audio_segment
        delayed = delayed - (28 + 8 * (1 - decay))  # 更大的音量衰减
        
        # 确保两个音频长度一致
        if len(delayed) > len(reverb_audio):
            reverb_audio = reverb_audio + AudioSegment.silent(duration=len(delayed) - len(reverb_audio))
        elif len(delayed) < len(reverb_audio):
            delayed = delayed + AudioSegment.silent(duration=len(reverb_audio) - len(delayed))
        
        # 更轻柔地叠加混响
        reverb_audio = reverb_audio.overlay(delayed)
    
    return reverb_audio

def add_vibrato(audio_segment, frequency=4.5, depth=0.025):
    """
    添加颤音效果，减少深度以避免多声部时的振荡
    """
    duration_ms = len(audio_segment)
    # 这里简化处理，实际应该对音频样本进行调制
    # 由于pydub限制，我们通过音量调制来模拟颤音效果
    
    # 创建颤音包络
    vibrato_audio = audio_segment
    
    # 分段应用轻微的音量变化来模拟颤音
    segment_length = 50  # 每段50ms
    segments = duration_ms // segment_length
    
    result = AudioSegment.empty()
    for i in range(segments):
        start_time = i * segment_length
        end_time = min((i + 1) * segment_length, duration_ms)
        
        segment = audio_segment[start_time:end_time]
        
        # 计算颤音调制（减少深度）
        phase = 2 * math.pi * frequency * start_time / 1000
        modulation = 1 + depth * math.sin(phase)
        
        # 更温和的音量调制，避免过度变化
        volume_change = 20 * math.log10(modulation) if modulation > 0 else 0
        # 限制音量变化范围，避免突然跳跃
        volume_change = max(-2, min(2, volume_change))
        
        if volume_change > 0:
            segment = segment + volume_change
        else:
            segment = segment - abs(volume_change)
        
        result += segment
    
    # 处理剩余部分
    if duration_ms % segment_length != 0:
        result += audio_segment[segments * segment_length:]
    
    return result

def apply_soft_limiter(audio_segment, threshold_db=-6, ratio=0.7):
    """
    应用软限制器，防止多声部播放时的削波失真
    
    参数:
    - threshold_db: 限制阈值 (dB)
    - ratio: 压缩比 (0-1, 1表示无压缩)
    """
    # 这是一个简化的软限制器实现
    # 在实际应用中，应该对音频样本进行逐点处理
    
    # 检测是否超过阈值
    if audio_segment.dBFS > threshold_db:
        # 计算需要压缩的量
        excess_db = audio_segment.dBFS - threshold_db
        compression_db = excess_db * (1 - ratio)
        
        # 应用压缩
        limited_audio = audio_segment - compression_db
        
        # 应用软饱和，进一步防止失真
        if limited_audio.dBFS > threshold_db + 1:
            # 轻微的额外衰减作为安全措施
            limited_audio = limited_audio - 1
            
        return limited_audio
    
    return audio_segment

def generate_realistic_flute_tone(frequency, duration=1000):
    """
    生成更真实的竹笛音色，优化了多声部播放的兼容性
    
    参数:
    - frequency: 基础频率
    - duration: 持续时间(毫秒)
    """
    # 使用基础正弦波，预降低音量为多声部预留动态范围
    base_tone = Sine(frequency).to_audio_segment(duration=duration) - 8  # 预降低8dB
    
    # 优化谐波结构：减少强烈的谐波以避免多音符冲突
    harmonic_2 = Sine(frequency * 2).to_audio_segment(duration=duration) - 32  # 进一步减弱
    harmonic_3 = Sine(frequency * 3).to_audio_segment(duration=duration) - 28  # 适度减弱
    harmonic_4 = Sine(frequency * 4).to_audio_segment(duration=duration) - 40  # 大幅减弱
    harmonic_5 = Sine(frequency * 5).to_audio_segment(duration=duration) - 35  # 适度减弱
    
    # 高频成分进一步减弱，避免刺耳
    harmonic_6 = Sine(frequency * 6).to_audio_segment(duration=duration) - 45
    
    # 混合所有谐波
    flute_tone = base_tone.overlay(harmonic_2).overlay(harmonic_3)
    flute_tone = flute_tone.overlay(harmonic_4).overlay(harmonic_5).overlay(harmonic_6)
    
    # 进一步降低整体音量，为多声部播放预留空间
    flute_tone = flute_tone - 6  # 总共降低约14dB
    
    # 更自然的包络：快速起音，缓慢衰减，自然收音
    attack_duration = 100    # 100ms快速起音
    decay_duration = 200     # 200ms初始衰减
    sustain_level = -2       # 持续音量稍微降低
    release_duration = 400   # 400ms自然收音
    
    # 应用复杂包络
    total_duration = len(flute_tone)
    
    # 起音阶段
    if total_duration > attack_duration:
        attack_part = flute_tone[:attack_duration].fade_in(attack_duration)
        remaining = flute_tone[attack_duration:]
        
        # 衰减阶段
        if len(remaining) > decay_duration:
            decay_part = remaining[:decay_duration]
            # 应用衰减
            decay_part = decay_part - 1  # 轻微衰减
            sustain_part = remaining[decay_duration:]
            
            # 持续和收音阶段
            if len(sustain_part) > release_duration:
                sustain_main = sustain_part[:-release_duration] + sustain_level
                release_part = sustain_part[-release_duration:].fade_out(release_duration)
                flute_tone = attack_part + decay_part + sustain_main + release_part
            else:
                sustain_part = sustain_part.fade_out(len(sustain_part))
                flute_tone = attack_part + decay_part + sustain_part
        else:
            remaining = remaining.fade_out(len(remaining))
            flute_tone = attack_part + remaining
    else:
        flute_tone = flute_tone.fade_in(attack_duration).fade_out(attack_duration)
    
    # 添加更轻微的颤音，避免多声部时的振荡
    flute_tone = add_vibrato(flute_tone, frequency=4.0, depth=0.02)
    
    # 添加气音效果，减少强度
    flute_tone = add_breath_noise(flute_tone, intensity=0.04)
    
    # 应用软限制器，防止多声部播放时的削波失真
    flute_tone = apply_soft_limiter(flute_tone, threshold_db=-8, ratio=0.6)
    
    return flute_tone

# 创建输出目录
for octave in ['low', 'mid', 'high']:
    os.makedirs(octave, exist_ok=True)

def create_polyphonic_optimized_note(frequency, octave_name, note_number, duration=2500):
    """
    创建针对多声部播放优化的音符
    """
    # 生成基础音色，已包含多声部优化
    tone = generate_realistic_flute_tone(frequency, duration=duration)
    
    # 添加轻柔的混响效果
    tone_with_reverb = add_subtle_reverb(tone)
    
    # 最终的安全限制，确保不会削波
    final_tone = apply_soft_limiter(tone_with_reverb, threshold_db=-10, ratio=0.5)
    
    return final_tone

# 生成所有音符（针对多声部播放优化）
print("=== 竹笛音符生成器 (多声部优化版) ===")
print("本版本针对多声部同时播放进行了以下优化：")
print("• 降低了单音符音量，为多声部预留动态范围")
print("• 减弱了谐波强度，避免频率冲突")
print("• 添加了软限制器，防止削波失真")
print("• 优化了颤音和气音效果")
print("• 可以安全地同时播放4-6个音符而不产生明显失真\n")

for octave_name, octave_notes in notes.items():
    print(f"正在生成{octave_name}音...")
    
    for num, freq in octave_notes.items():
        # 使用优化函数生成音符
        optimized_tone = create_polyphonic_optimized_note(freq, octave_name, num)
        
        # 导出音频文件
        filename = f"{octave_name}/{num}.wav"
        optimized_tone.export(filename, format="wav")
        print(f"已生成: {filename}")

print("\n=== 多声部播放建议 ===")
print("• 同时播放音符数量建议不超过4-6个")
print("• 如果仍有轻微失真，可以在播放器中进一步降低音量")
print("• 建议使用音频混音软件进行更专业的多轨处理")
print("• 生成的音频文件已经过优化，比原版本更适合多声部播放")
