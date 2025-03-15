export namespace backup {
	
	export class SerialConfig {
	    portName: string;
	    baudRate: number;
	    dataBits: number;
	    stopBits: string;
	    parity: string;
	    flowControl: string;
	
	    static createFrom(source: any = {}) {
	        return new SerialConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.portName = source["portName"];
	        this.baudRate = source["baudRate"];
	        this.dataBits = source["dataBits"];
	        this.stopBits = source["stopBits"];
	        this.parity = source["parity"];
	        this.flowControl = source["flowControl"];
	    }
	}
	export class SerialPortInfo {
	    name: string;
	    description: string;
	    isOpen: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SerialPortInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.isOpen = source["isOpen"];
	    }
	}
	export class TCPConfig {
	    address: string;
	
	    static createFrom(source: any = {}) {
	        return new TCPConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	    }
	}
	export class UDPConfig {
	    address: string;
	
	    static createFrom(source: any = {}) {
	        return new UDPConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	    }
	}

}

