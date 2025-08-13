
import cv2
import numpy as np
import os
import glob
from pathlib import Path

def process_single_image(img_path, output_base_dir):
    """处理单张精灵图并保存裁切结果"""
    img_name = Path(img_path).stem
    output_dir = os.path.join(output_base_dir, img_name)
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            print(f"无法读取图像: {img_path}")
            return

        # 透明通道处理
        if img.shape[2] == 4:
            alpha = img[:,:,3]
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(alpha, 1, 255, cv2.THRESH_BINARY)
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)

        # 优化边缘检测
        kernel = np.ones((3,3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.dilate(mask, kernel, iterations=1)

        # 检测轮廓并过滤小区域
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = 100  # 最小区域阈值

        for i, cnt in enumerate(contours):
            if cv2.contourArea(cnt) < min_area:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            cropped = img[y:y+h, x:x+w]
            output_path = os.path.join(output_dir, f"sprite_{i:03d}.png")
            cv2.imwrite(output_path, cropped)

        print(f"处理完成: {img_path} -> 输出到 {output_dir}")

    except Exception as e:
        print(f"处理 {img_path} 时出错: {str(e)}")



if __name__ == "__main__":
    os.makedirs('output', exist_ok=True)
    # 支持目录和单个文件输入
    img_paths = glob.glob(os.path.join('input', "*.png")) 

    for img_path in img_paths:
        process_single_image(img_path, 'output')
