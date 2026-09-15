export namespace model {
	
	export class LogEntry {
	    sequence: number;
	    timestamp: string;
	    level: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sequence = source["sequence"];
	        this.timestamp = source["timestamp"];
	        this.level = source["level"];
	        this.message = source["message"];
	    }
	}
	export class TunnelState {
	    phase: string;
	    profile_id?: string;
	    address?: string;
	    started_at?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TunnelState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.phase = source["phase"];
	        this.profile_id = source["profile_id"];
	        this.address = source["address"];
	        this.started_at = source["started_at"];
	        this.error = source["error"];
	    }
	}
	export class UISettings {
	    log_height: number;
	
	    static createFrom(source: any = {}) {
	        return new UISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.log_height = source["log_height"];
	    }
	}
	export class PortForward {
	    id: string;
	    local_port: string;
	    remote_host: string;
	    remote_port: string;
	
	    static createFrom(source: any = {}) {
	        return new PortForward(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.local_port = source["local_port"];
	        this.remote_host = source["remote_host"];
	        this.remote_port = source["remote_port"];
	    }
	}
	export class Profile {
	    id: string;
	    name: string;
	    host: string;
	    user: string;
	    port: string;
	    socks_port: string;
	    key_path: string;
	    accept_new_hostkey: boolean;
	    forwards: PortForward[];
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.socks_port = source["socks_port"];
	        this.key_path = source["key_path"];
	        this.accept_new_hostkey = source["accept_new_hostkey"];
	        this.forwards = this.convertValues(source["forwards"], PortForward);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Workspace {
	    version: number;
	    profiles: Profile[];
	    selected_profile_id: string;
	    ui: UISettings;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.profiles = this.convertValues(source["profiles"], Profile);
	        this.selected_profile_id = source["selected_profile_id"];
	        this.ui = this.convertValues(source["ui"], UISettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Bootstrap {
	    workspace: Workspace;
	    tunnel: TunnelState;
	    logs: LogEntry[];
	
	    static createFrom(source: any = {}) {
	        return new Bootstrap(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspace = this.convertValues(source["workspace"], Workspace);
	        this.tunnel = this.convertValues(source["tunnel"], TunnelState);
	        this.logs = this.convertValues(source["logs"], LogEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	

}

