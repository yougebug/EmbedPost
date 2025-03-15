package backup

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/serial"
)

// Client struct
type Client struct {
	// 连接相关字段
	tcpConn    net.Conn
	udpConn    *net.UDPConn
	serialPort serial.Port
	mu         sync.Mutex
	ctx        context.Context

	// 新增字段
	isReading bool
	stopRead  chan struct{}
}

// SerialPortInfo 串口信息
type SerialPortInfo struct {
	Name        string `json:"name"`        // 端口名称
	Description string `json:"description"` // 端口描述
	IsOpen      bool   `json:"isOpen"`      // 是否已打开
}

// NewClient 创建客户端
func NewClient() *Client {
	return &Client{}
}
func (a *Client) Startup(ctx context.Context) {
	a.ctx = ctx
}

// TCP连接配置
type TCPConfig struct {
	Address string `json:"address"` // 格式: "ip:port"
}

// UDP连接配置
type UDPConfig struct {
	Address string `json:"address"` // 格式: "ip:port"
}

// 串口配置
type SerialConfig struct {
	PortName    string      `json:"portName"`    // 端口名称，如 "COM1" 或 "/dev/ttyUSB0"
	BaudRate    int         `json:"baudRate"`    // 波特率
	DataBits    int         `json:"dataBits"`    // 数据位 (5, 6, 7, 8)
	StopBits    StopBits    `json:"stopBits"`    // 停止位 (1, 1.5, 2)
	Parity      Parity      `json:"parity"`      // 校验位
	FlowControl FlowControl `json:"flowControl"` // 流控制
}

// 停止位类型
type StopBits string

const (
	Stop1     StopBits = "1"
	Stop1Half StopBits = "1.5"
	Stop2     StopBits = "2"
)

// 校验位类型
type Parity string

const (
	ParityNone  Parity = "N"
	ParityOdd   Parity = "O"
	ParityEven  Parity = "E"
	ParityMark  Parity = "M"
	ParitySpace Parity = "S"
)

// 流控制类型
type FlowControl string

const (
	FlowNone     FlowControl = "none"
	FlowHardware FlowControl = "hardware"
	FlowSoftware FlowControl = "software"
)

// ConnectTCP 连接TCP服务器
func (a *Client) ConnectTCP(config TCPConfig) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.tcpConn != nil {
		a.tcpConn.Close()
	}

	conn, err := net.Dial("tcp", config.Address)
	if err != nil {
		return fmt.Errorf("TCP连接失败: %v", err)
	}

	a.tcpConn = conn
	return nil
}

// ConnectUDP 连接UDP服务器
func (a *Client) ConnectUDP(config UDPConfig) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.udpConn != nil {
		a.udpConn.Close()
	}

	addr, err := net.ResolveUDPAddr("udp", config.Address)
	if err != nil {
		return fmt.Errorf("UDP地址解析失败: %v", err)
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return fmt.Errorf("UDP连接失败: %v", err)
	}

	a.udpConn = conn
	return nil
}

// ConnectSerial 连接串口
func (c *Client) ConnectSerial(config SerialConfig) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 关闭之前的连接
	if c.serialPort != nil {
		c.stopSerialRead()
		c.serialPort.Close()
	}

	mode := &serial.Mode{
		BaudRate: config.BaudRate,
		DataBits: config.DataBits,
		StopBits: getStopBits(config.StopBits),
		Parity:   getParity(config.Parity),
	}

	port, err := serial.Open(config.PortName, mode)
	if err != nil {
		return fmt.Errorf("串口打开失败: %v", err)
	}

	c.serialPort = port
	c.startSerialRead()

	// 通知前端连接成功
	runtime.EventsEmit(c.ctx, "serial:connected", config.PortName)
	return nil
}

// startSerialRead 开始读取串口数据
func (c *Client) startSerialRead() {
	c.stopRead = make(chan struct{})
	c.isReading = true

	go func() {
		buffer := make([]byte, 1024)
		for c.isReading {
			select {
			case <-c.stopRead:
				return
			default:
				if c.serialPort == nil {
					return
				}

				// 设置读取超时
				c.serialPort.SetReadTimeout(time.Millisecond * 100)

				n, err := c.serialPort.Read(buffer)
				if err != nil {

					continue
				}

				if n > 0 {
					// 发送数据到前端
					runtime.EventsEmit(c.ctx, "serial:data", buffer[:n])
				}
			}
		}
	}()
}

// stopSerialRead 停止读取串口数据
func (c *Client) stopSerialRead() {
	if c.isReading {
		c.isReading = false
		close(c.stopRead)
	}
}

// WriteSerial 写入串口数据
// data: 要发送的数据字节数组
// 支持两种格式：
// 1. 普通文本转换的字节数组
// 2. 16进制格式转换的字节数组
func (c *Client) WriteSerial(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.serialPort == nil {
		return fmt.Errorf("串口未连接")
	}

	_, err := c.serialPort.Write(data)
	if err != nil {
		return fmt.Errorf("写入数据失败: %v", err)
	}

	return nil
}

// CloseSerial 关闭串口
func (c *Client) CloseSerial() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.serialPort == nil {
		return nil
	}

	c.stopSerialRead()
	err := c.serialPort.Close()
	if err != nil {
		return fmt.Errorf("关闭串口失败: %v", err)
	}

	c.serialPort = nil
	runtime.EventsEmit(c.ctx, "serial:disconnected")
	return nil
}

// GetSerialPorts 获取可用串口列表
func (c *Client) GetSerialPorts() ([]SerialPortInfo, error) {
	ports, err := serial.GetPortsList()
	if err != nil {
		return nil, fmt.Errorf("获取串口列表失败: %v", err)
	}

	var portInfos []SerialPortInfo
	for _, port := range ports {
		info := SerialPortInfo{
			Name:        port,
			Description: getPortDescription(port),
			IsOpen:      c.serialPort != nil && c.isCurrentPort(port),
		}
		portInfos = append(portInfos, info)
	}
	return portInfos, nil
}

// isCurrentPort 检查是否是当前打开的串口
func (c *Client) isCurrentPort(portName string) bool {
	if c.serialPort == nil {
		return false
	}
	// 这里需要根据具体的serial库实现来获取当前打开的串口名称
	// 这是一个示例实现
	return true // TODO: 实现实际的比较逻辑
}

// getPortDescription 获取串口描述信息
func getPortDescription(portName string) string {
	// TODO: 根据不同操作系统实现获取串口描述的逻辑
	return portName
}

// 辅助函数
func getStopBits(stopBits StopBits) serial.StopBits {
	switch stopBits {
	case Stop1:
		return serial.OneStopBit
	case Stop1Half:
		return serial.OnePointFiveStopBits
	case Stop2:
		return serial.TwoStopBits
	default:
		return serial.OneStopBit
	}
}

func getParity(parity Parity) serial.Parity {
	switch parity {
	case ParityNone:
		return serial.NoParity
	case ParityOdd:
		return serial.OddParity
	case ParityEven:
		return serial.EvenParity
	case ParityMark:
		return serial.MarkParity
	case ParitySpace:
		return serial.SpaceParity
	default:
		return serial.NoParity
	}
}

// SendData 发送数据（支持所有连接类型）
func (a *Client) SendData(connType string, data []byte) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	switch connType {
	case "tcp":
		if a.tcpConn == nil {
			return fmt.Errorf("TCP未连接")
		}
		_, err := a.tcpConn.Write(data)
		return err

	case "udp":
		if a.udpConn == nil {
			return fmt.Errorf("UDP未连接")
		}
		_, err := a.udpConn.Write(data)
		return err

	case "serial":
		if a.serialPort == nil {
			return fmt.Errorf("串口未连接")
		}
		_, err := a.serialPort.Write(data)
		return err

	default:
		return fmt.Errorf("未知的连接类型: %s", connType)
	}
}

// Close 关闭所有连接
func (a *Client) Close() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.tcpConn != nil {
		a.tcpConn.Close()
		a.tcpConn = nil
	}
	if a.udpConn != nil {
		a.udpConn.Close()
		a.udpConn = nil
	}
	if a.serialPort != nil {
		a.serialPort.Close()
		a.serialPort = nil
	}
}
