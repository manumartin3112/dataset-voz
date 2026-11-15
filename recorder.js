class Capture extends AudioWorkletProcessor { process(inputs,outputs) { if(inputs[0]?.[0]) this.port.postMessage(inputs[0][0].slice()); return true; }} registerProcessor('capture',Capture);
