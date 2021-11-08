export class TextBuffer {
    text = '';
    emit(str: string) { this.text += str; }
    prepend(str: string) { this.text = str + this.text; }
    emitLine(str: string = '') {
        this.emit('\n'); 
        this.emit(str); 
    }
    emitIndented(indent: number, str: string) { this.text += ' '.repeat(indent) + str; }
    emitIndentedLine(indent: number, str: string) { 
        this.emit('\n'); 
        this.emitIndented(indent, str); 
    }
}
  