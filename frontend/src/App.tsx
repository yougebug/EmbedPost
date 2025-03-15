import {useState, useEffect} from 'react';
import './App.css';
import {GetSerialPorts, ConnectSerial, WriteSerial} from '../wailsjs/go/backup/Client';
import {EventsOn, EventsOff} from '../wailsjs/runtime/runtime';

// 定义串口信息接口
interface SerialPortInfo {
    name: string;
    description: string;
    isOpen: boolean;
}

// 定义串口配置接口
interface SerialConfig {
    portName: string;
    baudRate: number;
    dataBits: number;
    stopBits: "1" | "1.5" | "2";
    parity: "N" | "O" | "E" | "M" | "S";
    flowControl: "none" | "hardware" | "software";
}

/**
 * 串口通信应用
 * 
 * 使用方法：
 * 1. 串口配置：
 *    - 手动输入串口名称（如 Windows: COM1, Linux: /dev/ttyUSB0）
 *    - 选择波特率（常用：9600, 115200）
 *    - 设置数据位（默认：8）
 *    - 设置停止位（默认：1）
 *    - 设置校验位（默认：无校验 N）
 *    - 设置流控制（默认：无）
 *    - 点击"连接"按钮建立连接
 * 
 * 2. 发送数据：
 *    普通文本模式：
 *    - 直接在文本框中输入要发送的内容
 *    - 点击"发送"按钮发送
 * 
 *    HEX模式（勾选"HEX发送"）：
 *    - 输入16进制数据，支持以下格式：
 *      * 空格分隔：01 02 03 0A FF
 *      * 0x前缀：0x01 0x02 0x03
 *      * 连续输入：01020304FF
 *    - 点击"发送"按钮发送
 * 
 * 3. 接收数据：
 *    - 接收到的数据会实时显示在下方数据框
 *    - 最多显示最近100条数据
 *    - 可点击"清除数据"按钮清空显示
 */
function App() {
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [receivedData, setReceivedData] = useState<string[]>([]);
    
    // 串口配置状态
    const [serialConfig, setSerialConfig] = useState<SerialConfig>({
        portName: '',
        baudRate: 9600,
        dataBits: 8,
        stopBits: "1",
        parity: "N",
        flowControl: "none"
    });

    const [sendData, setSendData] = useState('');
    const [isHex, setIsHex] = useState(false);

    // 处理配置变更
    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = e.target;
        setSerialConfig(prev => ({
            ...prev,
            [name]: name === 'baudRate' || name === 'dataBits' ? parseInt(value) : value
        }));
    };

    // 连接串口
    const handleConnect = async () => {
        try {
            await ConnectSerial(serialConfig);
        } catch (error) {
            console.error('串口连接失败:', error);
            setError('串口连接失败');
        }
    };

    // 获取串口列表
    const fetchSerialPorts = async () => {
        try {
            setLoading(true);
            setError('');
            const availablePorts = await GetSerialPorts();
            setPorts(availablePorts || []);
        } catch (error) {
            console.error('获取串口列表失败:', error);
            setError('获取串口列表失败');
            setPorts([{
                name: 'com4',
                description: '默认串口',
                isOpen: false
            }]);
        } finally {
            setLoading(false);
        }
    };

    // 组件加载时获取串口列表
    useEffect(() => {
        fetchSerialPorts();
    }, []);

    // 监听串口数据
    useEffect(() => {
        // 监听串口数据事件
        EventsOn("serial:data", (data: Uint8Array) => {
            const text = new TextDecoder().decode(data);
            setReceivedData(prev => [...prev, text].slice(-100)); // 保留最近100条数据
        });

        // 清理函数
        return () => {
            EventsOff("serial:data");
        };
    }, []);

    /**
     * 转换字符串为16进制字节数组
     * @param hex - 16进制字符串，支持以下格式：
     *             - 空格分隔：01 02 03 0A FF
     *             - 0x前缀：0x01 0x02 0x03
     *             - 连续输入：01020304FF
     * @returns Uint8Array 转换后的字节数组
     * @throws Error 当输入的16进制字符串格式无效时
     */
    const hexStringToBytes = (hex: string): Uint8Array => {
        // 移除所有空格和0x前缀
        hex = hex.replace(/\s+/g, '').replace(/0x/g, '');
        // 确保长度为偶数
        if (hex.length % 2 !== 0) {
            hex = '0' + hex;
        }
        
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (isNaN(byte)) {
                throw new Error('无效的16进制字符串');
            }
            bytes[i / 2] = byte;
        }
        return bytes;
    };

    /**
     * 发送数据处理
     * - 支持普通文本和16进制格式
     * - 自动处理输入格式
     * - 错误处理和提示
     */
    const handleSend = async () => {
        try {
            if (!sendData.trim()) {
                return;
            }

            let dataToSend: number[];  // 改为 number[] 类型
            if (isHex) {
                try {
                    const bytes = hexStringToBytes(sendData);
                    dataToSend = Array.from(bytes);  // 转换 Uint8Array 为 number[]
                } catch (error) {
                    setError('无效的16进制格式');
                    return;
                }
            } else {
                const encoder = new TextEncoder();
                const bytes = encoder.encode(sendData);
                dataToSend = Array.from(bytes);  // 转换 Uint8Array 为 number[]
            }

            await WriteSerial(dataToSend);
        } catch (error) {
            console.error('发送数据失败:', error);
            setError('发送数据失败');
        }
    };

    return (
        <div className="container">
            <div className="app-content">
                {/* 左侧面板：串口配置和数据发送 */}
                <div className="left-panel">
                    {/* 串口配置部分 */}
                    <div className="panel-section">
                        <div className="section-header">
                            <h2>串口配置</h2>
                            <button 
                                className="refresh-btn"
                                onClick={fetchSerialPorts}
                                disabled={loading}
                            >
                                {loading ? '刷新中...' : '刷新'}
                            </button>
                        </div>
                        
                        <div className="serial-config">
                            <div className="config-item">
                                <label>串口名称:</label>
                                <input
                                    type="text"
                                    name="portName"
                                    value={serialConfig.portName}
                                    onChange={handleConfigChange}
                                    placeholder="例如: COM1 或 /dev/ttyUSB0"
                                />
                            </div>

                            <div className="config-grid">
                                <div className="config-item">
                                    <label>波特率:</label>
                                    <select name="baudRate" value={serialConfig.baudRate} onChange={handleConfigChange}>
                                        {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(rate => (
                                            <option key={rate} value={rate}>{rate}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="config-item">
                                    <label>数据位:</label>
                                    <select name="dataBits" value={serialConfig.dataBits} onChange={handleConfigChange}>
                                        {[5, 6, 7, 8].map(bits => (
                                            <option key={bits} value={bits}>{bits}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="config-item">
                                    <label>停止位:</label>
                                    <select name="stopBits" value={serialConfig.stopBits} onChange={handleConfigChange}>
                                        <option value="1">1</option>
                                        <option value="1.5">1.5</option>
                                        <option value="2">2</option>
                                    </select>
                                </div>

                                <div className="config-item">
                                    <label>校验位:</label>
                                    <select name="parity" value={serialConfig.parity} onChange={handleConfigChange}>
                                        <option value="N">无校验</option>
                                        <option value="O">奇校验</option>
                                        <option value="E">偶校验</option>
                                        <option value="M">标记</option>
                                        <option value="S">空格</option>
                                    </select>
                                </div>
                            </div>

                            <div className="config-item">
                                <label>流控制:</label>
                                <select name="flowControl" value={serialConfig.flowControl} onChange={handleConfigChange}>
                                    <option value="none">无</option>
                                    <option value="hardware">硬件流控</option>
                                    <option value="software">软件流控</option>
                                </select>
                            </div>

                            <button 
                                className="connect-btn"
                                onClick={handleConnect}
                            >
                                连接
                            </button>
                        </div>
                    </div>

                    {/* 数据发送部分 */}
                    <div className="panel-section">
                        <div className="section-header">
                            <h3>发送数据</h3>
                            <label className="hex-switch">
                                <input
                                    type="checkbox"
                                    checked={isHex}
                                    onChange={(e) => setIsHex(e.target.checked)}
                                />
                                HEX发送
                            </label>
                        </div>
                        <div className="send-content">
                            <textarea
                                value={sendData}
                                onChange={(e) => setSendData(e.target.value)}
                                placeholder={isHex ? "请输入16进制数据，如: 01 02 03 0A FF" : "请输入要发送的数据"}
                                className="send-input"
                            />
                            <button 
                                className="send-btn"
                                onClick={handleSend}
                                disabled={!sendData.trim()}
                            >
                                发送
                            </button>
                        </div>
                    </div>
                </div>

                {/* 右侧面板：数据显示 */}
                <div className="right-panel">
                    <div className="panel-section">
                        <div className="section-header">
                            <h3>接收数据</h3>
                            <button 
                                className="clear-btn"
                                onClick={() => setReceivedData([])}
                            >
                                清除
                            </button>
                        </div>
                        <div className="data-content">
                            {receivedData.map((data, index) => (
                                <div key={index} className="data-item">
                                    {data}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
