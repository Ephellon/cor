(function(cor){

var EcmaReservedKeywords = [
    // Ecma-262 Keyword
    'break', 'do', 'instanceof', 'typeof',
    'case', 'else', 'new', 'var',
    'catch', 'finally', 'return', 'void',
    'continue', 'for', 'switch', 'while',
    'debugger', 'function', 'with',
    'default', 'if', 'throw',
    'delete', 'in', 'try', 'null',

    // Ecma-262 FutureReservedWord
    'class', 'enum', 'extends',
    'const', 'export', 'import',

    // Ecma-262 FutureReservedWord (in strict mode)
    'implements', 'let', 'private', 'public', 'yield',
    'interface', 'package', 'protected', 'static'
];

var EcmaNativeClasses = [
    // Ecma-262
    'Arguments', 'Array', 'Boolean', 'Date',
    'Error', 'Function', 'JSON', 'Math',
    'Number', 'Object', 'RegExp', 'String'
];


var
Class   = cor.Class,
yy      = cor.yy,
hasProp = Object.prototype.hasOwnProperty,
slice   = Array.prototype.slice,
translationTable = {
    'nil': 'null',
    'func': 'function ',
    'if': 'if ',
    'else': ' else ',
    'for': 'for ',
    'in': ' in ',
    'switch': 'switch ',
    'case': 'case ',
    'return': 'return ',
    'break': 'break;',
    'continue': 'continue;',
    'try': 'try ',
    'catch': ' catch ',
    'finally': ' finally ',
    'throw': 'throw ',
    '=': ' = ',
    ',': ', ',
    ':': ': ',
    '+': ' + ',
    '-': ' - ',
    '*': ' * ',
    '/': ' / ',
    '%': ' % ',
    '<': ' < ',
    '>': ' > ',
    '<<': ' << ',
    '>>': ' >> ',
    '>>>': ' >>> ',
    '==': ' === ',
    '!=': ' !== ',
    '+=': ' += ',
    '-=': ' -= ',
    '*=': ' *= ',
    '/=': ' *= ',
    '%=': ' %= ',
    '~=': ' ~= ',
    '>=': ' >= ',
    '<=': ' <= ',
    '<<=': ' <<= ',
    '>>=': ' >>= ',
    '>>>=': ' >>>= ',
    '&&': ' && ',
    '||': ' || ',
    '|': ' | ',
    '&': ' & ',
    '^': ' ^ '
};

var builtinFn = [
    'error',
    'super',
    'regex',
    'chan',
    'timeout',
    'copy'
];

function isBuiltinFn(name) {
    return builtinFn.indexOf(name) !== -1;
}


function isEcmaReservedKeyWord(name) {
    return EcmaReservedKeywords.indexOf(name) !== -1;
}

function isUsedAsStatement(node) {
    return node.parent instanceof yy.SimpleStmtNode;
}

yy.parseError = function parseError (msg, hash, replaceMsg) {
    var filename = yy.env.filename;
    //is non recoverable parser error?
    if (hash && hasProp.call(hash, 'loc') && hash.expected) {
        switch (hash.text) {
            case '\n': hash.text = 'end of line';  break;
            case ''  : hash.text = 'end of input'; break;
        }
        msg = replaceMsg ? msg : 'unexpected ' + hash.text;
    }
    else {
        msg = replaceMsg ? msg : 'unexpected ' + msg;
    }

    msg += ' at ' + filename + ':' + hash.loc.first_line;

    throw msg;
}


/*
There is two types of routes:

- Delegate : ends with file extensions, example `filename.js`
- Public   : is tested against `^[a-z_-]+$` regex

Routes are tested in the same order as types above, if the route does not match to
any of before types then it will be proccessed by `packagize` function which transform
routes according to Cor package convention.
*/
yy.generateRoute = function(route) {
    var
    parsed,
    rFileNameExt = /([\s\S]+)*(^|\/)([\w\-]+)*(\.[\w\-]+)*$/,
    rPublic      = /^[a-z_-]+$/;
    
    // replace \ by /
    function normalize(route) {
        return route.replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    // Public modules
    if (rPublic.test(route)) {
        return normalize(route);
    }
    
    // Delegate, is a route that has explicit file extension
    // example: jquery.js, mylib.cor
    // parsed[4] is the file extension
    // so if parsed[4]? then is delegate route
    parsed = rFileNameExt.exec(route);
    if (parsed && parsed[4]) {
        return normalize(route);
    }


    // resturn route as is
    return route;
}

// iterate recursevely in preorder starting from the node passed
// as first parameter, it executes the function passed as second parameter
// in each visited node, iteration ends if the function returns false
function preorder(node, fn) {
    if (!(node instanceof yy.Node)) {
        return;
    }

    var i,
    ch  = node.children,
    len = ch.length;

    for (i = 0; i < len; i++) {
        if (!ch[i]) {
            continue;
        }

        if (fn(ch[i]) === false) {
            return;
        }
        preorder(ch[i], fn);
    }
}

function flattenToLine(node, lineno) {
    node.lineno = lineno;
    preorder(node, function(node) {
        node.lineno = lineno;
    })
}


function moveToLine(node, offset) {
    preorder(node, function(node) {
        node.lineno += offset;
    })
}


function stringifyNode(node) {
    var
    i,
    ret = '',
    ch  = node.children,
    len = ch.length;

    if (ch instanceof Array) {
        for (i = 0; i < len; i++) {
            ret += stringifyNode(ch[i]);
        }
    }
    else {
        ret = ch;
    }

    return ret;
}

function getLesserLineNumber(node){
    var
    i = 0, len,
    lineno, selLine, ch;

    if (node) {
        selLine = node.lineno;
        ch  = node.children;
    }
    if (!ch) {
        return lineno;
    }

    len = ch.length;
    for (i = 0; i < len; i++) {
        lineno = getLesserLineNumber(ch[i]);
        if (lineno < selLine) {
            selLine = lineno;
        }
    }

    return selLine;
};

// the base class for all AST nodes
yy.Node = Class({

    type: 'Node',

    _runtimePrefix: 'CRL.',

    scope: null,

    types: null,

    init: function init(children) {
        this.children = [];
        this.lineno   = yy.env.loc.first_line;
        this.loc      = Object.create(yy.env.loc);

        this.yy       = yy;

        // setup parent node for later referencing
        this.adopt(slice.call(arguments));

        this.initNode();
    },

    // adopt an array of nodes
    adopt: function(children) {
        var
        i = 0, len;
        for (len = children.length; i < len; i++) {
            if (children[i]) {
                this.children[i] = children[i];
                this.children[i].parent = this;
            }
        }
    },

    initNode: function() {
        // virtual
    },

    runtimeFn: function(name) {
        return this.runtimePrefix(name + '(');
    },

    runtimePrefix: function(txt) {
        this.yy.env.usesRuntime = true;
        return this._runtimePrefix + txt;
    },

    error: function(txt, lineno) {
        throw 'Error: ' + txt + ' at ' + yy.env.filename + ':' + lineno;
    },

    compile: function() {
        // virtual
    }
});

// List of nodes
yy.List = Class(yy.Node, {

    type: 'List',

    children: null,

    init: function() {
        this.children = [];
        this.adopt(slice.call(arguments));
    },

    add: function() {
        this.children = this.children.concat(slice.call(arguments));
        this.adopt(this.children);
    },

    addFront: function() {
        this.children = slice.call(arguments).concat(this.children);
        this.adopt(this.children);
    },

    last: function() {
        return this.children[this.children.length - 1];
    }

});


// Literals are the smallest units to be compiled
// its children is a string which must be returned
// to write as compiled code
// most of the nodes compiles by constructing yy.Lit-s
// and adopting as children to be later readed by the compiler
yy.Lit = yy.LiteralNode = Class(yy.Node, {

    type: 'Lit, LiteralNode',

    init: function(ch, yloc) {
        this.children = ch;
        this.lineno   = isNaN(yloc) ? yloc.first_line : yloc;
        this.loc      = yloc;
        this.yy       = yy;

        this.initNode();
    },

    compile: function() {
        var
        txt = this.children, t;

        if (hasProp.call(translationTable, txt)) {
            txt = translationTable[txt];
        }

        return txt;
    }
});

yy.ObjectPropertyNode = Class(yy.Lit, {

    type: 'ObjectPropertyNode',

    compile: function() {
        return this.children;
    }

})


// Single line comment
// is a comment starting by `//` and ends in the next EOL
yy.SingleLineCommentNode = Class(yy.Lit, {

    type: 'SingleLineCommentNode',

    compile: function() {
        this.children = [
            new yy.Lit(this.children, this.lineno)
        ];
    }

});

// A comment beginning and ending with `---`
// this kind of comments must have a new line before and after
yy.MultiLineCommentNode = Class(yy.Lit, {

    type: 'MultiLineCommentNode',

    compile: function() {
        this.children = this.children
            .replace(/^(\s*)---/, '$1/*')
            .replace(/---(\s*)$/, '*/$1');

        var i, str,
        lineno   = this.lineno,
        splitted = this.children.split(/\r\n|\n/),
        len      = splitted.length;

        for (i = 0; i < len; i++) {
            str = splitted[i].replace(/^\s+/, '');
            splitted[i] = new yy.Lit(str, lineno + i);
        }

        this.children = splitted;
    }

});


// A value is anithing that can be assigned,
// an object literal, a string, boolean ...
yy.ValueList = Class(yy.List, {

    type: 'ValueList',

    compile: function() {
        var ch, i = this.children.length;
        while (--i) {
            ch = this.children[i];
            if (!ch || ch.children === ',') {
                this.children.pop();
            }
            else {
                break;
            }
        }
    }

});

// Node to wrap a single line expression or Inc-Dec statement
yy.SimpleStmtNode = Class(yy.Node, {

    type: 'SimpleStmtNode',

    initNode: function() {
        this.base('initNode', arguments);
        var
        i = 0,
        len = this.children.length,
        item;

        for (; i < len; i++) {
            item = this.children[i];
            if (item instanceof yy.VarNode) {
                item.markAsLocalVar();
                item.children = '';
                if (this.children[i + 1]) {
                    this.children[i + 1].children = '';
                    i++;
                }
            }
        }
    }
});

// Cor nodes such as modules, functions and clases knows
// has their own context to know about variable scoping.
// This is the base class
yy.ContextAwareNode = Class(yy.Node, {

    type: 'ContextAwareNode',

    context: null,

    initNode: function() {
        this.base('initNode', arguments);
        this.context = this.yy.env.popContext();
        this.context.ownerNode = this;
    },

    compile: function() {
        this.yy.env.newContext(this.context);
    }
});

// A module is a root node of the AST
yy.ModuleNode = Class(yy.ContextAwareNode, {

    type: 'ModuleNode',

    initializerName: 'init',

    compile: function() {
        this.base('compile', arguments);
        var i, item, name,
        nameLineno,
        isQualified,
        initialize = '',
        footer     = '',
        names      = {},
        ls         = this.children[0],
        len        = ls.children.length;

        for (i = 0; i < len; i++) {
            item = ls.children[i];
            if (item instanceof yy.FunctionNode) {
                if (typeof item.name === 'undefined') {
                    this.error('nameless function', getLesserLineNumber(item));
                }
                name       = item.name;
                nameLineno = item.nameLineno;
                if (name === this.initializerName) {
                    initialize = this.initializerName + '.call(this);';
                }
                this.context.ignoreVar(name);
            } else if (item instanceof yy.AssignmentNode) {
                item = item.children[0];
                if (item.children.length > 1) {
                    isQualified = true;
                    continue;
                }
                else {
                    item       = item.children[0];
                    name       = item.children;
                    nameLineno = item.lineno;
                }
            } else if (item instanceof yy.ClassNode) {
                name       = item.className;
                nameLineno = item.children[1].lineno;
            }

            if (name) {
                if (hasProp.call(names, name)) {
                    this.error("Can not redeclare '" + name + "'", nameLineno);
                }
                names[name] = true;
                this.yy.env.addExported(name);
                this.context.addLocalVar(name);
            }
            name = null;
        }

        if (ls) {
            initialize += this.getExport();
            footer      = initialize !== '' ? ';' + initialize : '';
            ls.children.unshift(new yy.Lit(this.context.compileVars(), 1));
            ls.children.push(new yy.Lit(footer, this.lineno));
        }
    },

    getExport: function() {
        var
        name,
        ret      = '',
        basen    = basename(this.yy.env.filename),
        exported = this.yy.env.getExported();

        function basename(filename) {
            var parsed = /([a-zA-Z-0-9_\-]*)([a-zA-A-0-9_\-\.]*)$/.exec(filename);
            return parsed ? parsed[1] : '';
        }

        function isCapitalized(txt) {
            return /^[A-Z]/.test(txt);
        }

        if (isCapitalized(basen)) {
            if (exported.hasOwnProperty(basen)) {
                return 'module.exports = ' + basen + ';';
            }
            else {
                this.error('undeclared default exported value', 1);
            }
        }

        for (name in exported) {
            if (name !== this.initializerName) {
                ret += 'exports.' + name + ' = ' + exported[name] + '; ';
            }
        }
        return ret;
    }
});

// Node for function and class blocks
yy.BlockNode = Class(yy.Node, {
    type: 'BlockNode',

    init: function() {
        this.base('init', arguments);

        var node, i, ch, len;

        if (this.children[1] instanceof yy.List) {
            ch = this.children[1].children;
            len = ch.length;

            for (i = 0; i < len; i++) {
                node = ch[i];
                if (node instanceof yy.FunctionNode && typeof node.name === 'undefined') {
                    this.error('nameless function', getLesserLineNumber(node));
                }
            }    
        }
    }
});

// Node for dot-expression syntax: `a.b.c`
yy.SelectorExprNode = Class(yy.Node, {
    type: 'SelectorExprNode'
});

// Expression such as !x, -x...
yy.UnaryExprNode = Class(yy.Node, {
    type: 'UnaryExprNode'
});

// Expression wrapped by `(` and `)`
yy.AssociationNode = Class(yy.Node, {
    type: 'AssociationNode'
});


// The Cor functions definition
// it initializes variables used in its context
yy.FunctionNode = Class(yy.ContextAwareNode, {

    type: 'FunctionNode',

    name: null,

    nameLineno: null,

    initNode: function() {
        this.base('initNode', arguments);
        var
        ch = this.children;
        if (ch[1]) {
            this.name = ch[1].children;
            this.nameLineno = ch[1].lineno;
        }
        if (!(this.children[5] instanceof yy.BlockNode)) {
            this.children[5] = new yy.BlockNode(
                new yy.Lit('{', ch[4].lineno),
                new yy.Lit('return', getLesserLineNumber(ch[5])),
                new yy.List(ch[5]),
                new yy.Lit('}', ch[5].lineno)
            );
        }

        this.block = this.children[5];
    },

    compile: function() {
        // declare scoped vars
        this.block.children[0].children = ' {' + this.context.compileVars();
        this.base('compile', arguments);
    }
});

yy.SliceNode = Class(yy.Node, {

    type: 'SliceNode',

    initNode: function() {
        this.base('initNode', arguments);

        this.start = this.children[2];
        this.len   = this.children[4];
    },
    
    compile: function() {
        var
        lit,
        start = this.start,
        len   = this.len,
        ch    = this.children;

        if (start === undefined) {
            start = new yy.Lit('0', ch[1].lineno);
        }

        this.children = [
            ch[0],
            new yy.Lit('.slice(', ch[1].lineno),
            start
        ];

        if (len !== undefined) {
            if (len instanceof yy.UnaryExprNode && typeof len.children[1].children === 'string') {
                lit     = new yy.Lit(stringifyNode(len), len.lineno);
                lit.loc = len.children[1].loc;
                len     = lit;
            }

            this.children.push(
                new yy.Lit(', ', ch[3].lineno),
                len
            );
        }

        this.children.push(new yy.Lit(')', ch[5].lineno));
    }

});

yy.ObjectConstructorNode = Class(yy.Node, {

    type: 'ObjectConstructorNode',

    isLiteral: false,

    initNode: function() {
        this.base('initNode', arguments);
        this.className       = this.children[1] ? this.children[1].children : null;
        this.constructorArgs = this.children[2];
    },

    compile: function() {
        
        var qn,
        ch         = this.children,
        prefix     = 'new ',
        constrArgs = this.constructorArgs,
        className  = this.className;

        if (constrArgs) {
            if (constrArgs.keyValue) {
                if (className) {
                    ch.splice(2, 0, new yy.Lit('(', ch[2].children[0].lineno));
                    ch.push(3, 0,   new yy.Lit(')', ch[3].children[2].lineno));
                }
                else {
                    prefix = '';
                    this.isLiteral = true;
                }
            }
            else {
                if (!className) {
                    ch[1] = new yy.Lit('Object', ch[0].lineno);
                }
            }
        }
        else {
            qn = ch[1];
            ch.push(new yy.Lit('()', qn.children[qn.children.length - 1].lineno));
        }

        ch[0] = new yy.Lit(prefix, ch[0].lineno);
    }

});

yy.ObjectConstructorArgsNode = Class(yy.Node, {

    type: 'ObjectConstructorArgsNode',

    initNode: function() {
        var ch = this.children;

        if (!ch[1]) {
            this.keyValue = true;
        }
        if (ch[3]) { // key-value
            this.keyValue = true;
            this.checkKeyNames(ch[1]);
        }
    },

    checkKeyNames: function(list) {
        var
        elements = list.children,
        names = {}, i, name, element,
        len = elements.length;

        for (i = 0; i < len; i++) {
            element = elements[i];

            if (!(element instanceof yy.Lit || element.children[0] instanceof yy.Str)){
                name = element.children[0].children;
                if (hasProp.call(names, name)) {
                    this.error('Can not repeat object key "' + name + '"', element.children[0].lineno);
                }
                names[name] = true;
            }
        }
    },

    compile: function() {
        if (this.keyValue) {
            this.children[0].children = '{';
            this.children[2].children = '}';
            if (!this.parent.isLiteral) {
                this.children.splice(2, 0, new yy.Lit(', _conf: true', this.children[2].lineno))
            }
        }
        else {
            this.children[0].children = '(';
            this.children[2].children = ')';
        }
    }
});

yy.ArrayConstructorNode = Class(yy.Node, {

    type: 'ArrayConstructorNode',

    compile: function() {
        var ch = this.children[1];
        if (ch && (ch.children.length % 2) === 0) {
            ch.children.pop();
        }
    }

})

yy.TypeAssertNode = Class(yy.Node, {

    type: 'TypeAssertNode',

    initNode: function() {
        this.base('initNode', arguments);
        this.typeParam = this.children[3];
    },

    compile: function() {
        var
        ch  = this.children;

        this.children = [
            new yy.Lit(this.runtimeFn('assertType'), ch[0].lineno),
            ch[0]
        ];

        if (this.typeParam) {
            this.children.push(new yy.Lit(', ', ch[1].lineno));
            this.children.push(this.typeParam);
        }

        this.children.push(new yy.Lit(')', ch[4].lineno));
    }
});

yy.AssignmentNode = Class(yy.Node, {

    type: 'AssignmentNode',

    rUpper: /^[A-Z]+$/,

    initNode: function() {
        this.base('initNode', arguments);
        var
        ch = this.children;

        if (ch[0] instanceof yy.VarNode) {
            ch[0].markAsUsedVar();
        }
    }
});

yy.VarNode = Class(yy.Node, {

    type: 'VarNode',

    name: null,

    initNode: function() {
        this.base('initNode', arguments);
        this.context = this.yy.env.context();
        this.name = this.children[0].children;

        if (isEcmaReservedKeyWord(this.name)) {
            this.children[0].children = this.name += '_';
        }
    },

    markAsUsedVar: function() {
        this.context.addUsedVar(this.name);
    },

    markAsLocalVar: function() {
        this.context.addLocalVar(this.name);
    }

});

yy.Str = yy.StringNode = Class(yy.Lit, {

    type: 'Str, StringNode',

    compile: function() {        
        var i, str,
        newNode,
        lineno   = this.lineno,
        splitted = this.children.split(/\r\n|\n/),
        len      = splitted.length;

        for (i = 0; i < len; i++) {
            str = splitted[i].replace(/^\s+/, '');
            if (i < len - 1) {
                str += '\\';
            }
            newNode = new yy.Lit(str, lineno + i);
            
            newNode.loc = {
                first_line: lineno + i,
                first_column: this.loc.first_column
            };

            splitted[i] = newNode;
        }

        this.children = splitted;
    }
});

yy.UseNode = Class(yy.Node, {

    type: 'UseNode',

    rAlias: /([\w\-]+)*(?:\.[\w\-]+)*$/,

    rClearName: /[^\w]/,

    extractedAlias: '',

    initNode: function() {
        this.base('initNode', arguments);

        var parsed;

        this.aliasNode  = this.children[2];
        this.targetNode = this.children[1];
        this.route      = this.yy.generateRoute(this.targetNode.children.substring(1, this.targetNode.children.length - 1)); // trim quotes
        this.alias      = this.aliasNode ? this.aliasNode.children : '';

        if (!this.route) {
            this.error('invalid route format', this.targetNode.lineno);
        }

        parsed = this.rAlias.exec(this.route);
        if (parsed) {
            this.extractedAlias = (parsed[1] || '').replace(this.rClearName, '_');    
        }

        this.yy.env.context().addLocalVar(this.alias || this.extractedAlias);
    },

    compile: function() {
        var
        ch     = this.children,
        route  = this.route,
        alias  = this.alias || this.extractedAlias;

        ch[0].children = 'require(';

        if (alias) {
            if (! this.aliasNode) {
                this.aliasNode = new yy.Lit(alias, ch[0].lineno);
                this.aliasNode.loc = ch[0].loc;
            }
            this.aliasNode.children += ' = ';
        }

        this.targetNode.children = "'" + route + "'";
        this.children = [
            this.aliasNode,
            ch[0],
            this.targetNode,
            new yy.Lit(');', ch[1].lineno)
        ];
    }
   
});

yy.MeNode = Class(yy.Lit, {

    type: 'MeNode',

    compile: function() {
        if (! this.insideClassContext()) {
            this.error("Using 'me' identifier outside a class context", this.lineno);
        }
        return this.base('compile', arguments);
    },

    insideClassContext: function(){
        var ctx = this.yy.env.context();

        while (true) {
            if (ctx.ownerNode instanceof yy.ClassNode) {
                return true;
            }
            else if (ctx.parent){
                ctx = ctx.parent;
            }
            else {
                return false;
            }
        }

    }
});

yy.ClassNode = Class(yy.ContextAwareNode, {

    type: 'ClassNode',

    className: null,

    superClassName: null,

    initializerNode: null,

    initializerName: 'init',

    initNode: function() {
        this.base('initNode', arguments);
        var
        ch    = this.children,
        cname = ch[1].children;

        this.className       = cname;
        this.superClassName  = this.getSuperClassName();
        this.block           = ch[3];
        this.propertiesNames = [];

        this.propertySet = new yy.PropertySetNode();
        this.propertySet.parent = this;
        
        this.methodSet = new yy.MethodSetNode();
        this.methodSet.parent = this;

        this.setupSets(this.block);

        if (this.propertiesNames.length > 0) {
            this.hasProperties = true;
        }

        this.yy.env.registerClass(this);

        this.yy.env.context().addLocalVar(this.className);
    },

    getSuperClassName: function() {
        if (! this.children[2]) {
            return null;
        }
        return stringifyNode(this.children[2].children[1]);
    },

    setupSets: function(block) {
        var i, member, pos = -1,
        members     = block.children[1] ? block.children[1].children : [],
        methods     = [],
        properties  = [],
        names       = {},
        methodFound = false;

        for (i = 0; i < members.length; i++) {
            pos++;
            member = members[i];
            if (hasProp.call(names, member.name)) {
                this.error('Redeclaring "' + member.name + '" in a class body', member.nameLineno);
            }
            if (member instanceof yy.MethodNode) {
                if (member.name === this.initializerName) {
                    if (pos !== 0) {
                        this.error('"' + this.initializerName + '" must the first method in a class body', member.lineno);
                    }
                    this.initializerNode = member;
                }
                methods.push(members.splice(i, 1)[0]);
                methodFound = true;
                i--;
            }
            else if (methodFound === true) {
                this.error('Declareing property "' + member.name + '" after method declaration', member.nameLineno);
            }
            else {
                properties.push(members.splice(i, 1)[0]);
                this.propertiesNames.push(member.name);
                this.context.ignoreVar(member.name);
                i--;
            }

            if (member.name === this.className) {
                this.error('The member "' + member.name + '" is named equal to the owner class', member.nameLineno);
            }
            names[member.name] = true;
        }

        this.propertySet.adopt(properties);
        if (properties.length) {
            this.propertySet.lineno = properties[properties.length - 1].lineno;
        }
        else {
            this.propertySet.lineno = block.children[0].lineno;
        }

        this.methodSet.adopt(methods);
        if (methods.length) {
            this.methodSet.lineno = methods[methods.length - 1].lineno;
        }
    },

    compileWithInit: function() {
        var i, len, newNode,
        extendsStr   = '',
        ch           = this.children;

        if (this.superClassName) {
            extendsStr = ', ' + this.superClassName;
        }

        newNode = new yy.Lit(this.className + ' = function ' + this.className, ch[0].lineno);
        newNode.loc = ch[1].loc;
        this.children = [
            newNode,
            this.methodSet
        ];

        if (this.superClassName) {
            this.methodSet.children[0].children[1].children += this.runtimeFn('subclass') + this.className + extendsStr +');';
        }
    },

    compileWithoutInit: function() {
        var i, len, newNode,
        ch = this.children,
        superInitStr   = '',
        extendsStr     = '',
        prepareInitStr = '',
        argsStr        = this.propertiesNames.join(', ');


        if (this.hasProperties) {
            prepareInitStr = 'var _conf;_conf=((_conf=arguments[0])&&_conf._conf)?_conf:null; '
        }        

        if (this.superClassName) {
            extendsStr   = ', ' + this.superClassName;            
            if (this.hasProperties) {
                superInitStr = this.superClassName + '.prototype.constructor.call(this, _conf);';
            }
            else {
                superInitStr = this.superClassName + '.prototype.constructor.apply(this, arguments);';
            }
        }

        this.children = [];

        newNode = new yy.Lit(this.className + ' = function ' + this.className, ch[0].lineno);
        newNode.loc = ch[1].loc;
        this.children.push(newNode);

        newNode = new yy.Lit('('+ argsStr +'){' + prepareInitStr + superInitStr, ch[1].lineno);
        newNode.loc = ch[1].loc;
        this.children.push(newNode);

        this.children.push(this.propertySet);
        this.children.push(new yy.Lit('};', this.propertySet.lineno));

        if (this.superClassName) {
            newNode = new yy.Lit(this.runtimeFn('subclass') + this.className + extendsStr +');', this.propertySet.lineno);
            newNode.loc = ch[2].loc;
            this.children.push(newNode);
        }

        this.children.push(this.methodSet);
    },

    compile: function() {
        this.base('compile', arguments);
        if (this.initializerNode) {
            this.compileWithInit();
        }
        else {
            this.compileWithoutInit();
        }
    }        

});


yy.PropertySetNode = Class(yy.Node, {

    type: 'PropertySetNode'

});


yy.PropertyNode = Class(yy.Node, {

    type: 'PropertyNode',

    name: null,

    nameLineno: null,

    hasDefaultValue: false,

    initNode: function() {
        this.base('initNode', arguments);
        this.name = this.children[0].children;
        this.nameLineno = this.children[0].lineno;
        if (this.children.length > 1) {
            this.hasDefaultValue = true;
        }
    },

    compile: function() {
        var
        str = '',
        ch  = this.children;

        ch[0].children = 'this.' + this.name;

        str = '=(_conf&&_conf.hasOwnProperty(\'' + this.name + '\'))?_conf.' + this.name + ':' + this.name;
        
        if (this.hasDefaultValue) {
            str += '==void 0?';
            ch.splice(3, 0, new yy.Lit(':' + this.name, ch[2].lineno));
        }

        ch[1].children = str;
    }
});

yy.MethodSetNode = Class(yy.Node,{
    type: 'MethodSetNode'    
});

yy.MethodNode = Class(yy.Node, {

    type: 'MethodNode',

    name: null,

    nameLineno: null,

    isInitializer: null,

    initNode: function() {
        this.base('initNode', arguments);

        this.name = this.children[0].name;
        this.nameLineno = this.children[0].children[1].lineno;
    },

    compileInit: function() {
        var
        callSuper      = false,
        superInitStr   = '',
        superClassName = this.parent.parent.superClassName;

        if (superClassName) {
            
            preorder(this, function(node) {
                if (node instanceof yy.CallNode && node.name == 'super') {
                    callSuper = true;
                    return false;
                }
            })

            if (!callSuper) {
                superInitStr = superClassName + '.prototype.constructor.apply(this, arguments);';
                this.children[0].block.children.splice(1, 0, new yy.Lit(superInitStr, this.children[0].block.children[0].lineno));
            }
        }

        this.isInitializer = true;
        this.children[0].children.splice(0, 2);        
        this.children[0].context.addLocalVar('me', 'this');
    },

    compile: function() {
        if (this === this.parent.parent.initializerNode) {
            this.compileInit();
        }
        else {
            var className = this.parent.parent.className;
            this.children[0].children[0].children = className + '.prototype.' + this.name + ' = function ';
            this.children[0].context.addLocalVar('me', 'this');    
        }
    }
});

yy.CallNode = Class(yy.Node, {

    type: 'CallNode',

    name: null,

    forSelect: false,

    initNode: function() {
        this.base('initNode', arguments);
        this.context = this.yy.env.context();

        if (this.children[0] instanceof yy.VarNode) {
            this.name = this.children[0].name;
        }
    },

    compile: function() {
        var
        ch = this.children, last, builtin;

        builtin = this[this.name + 'Builtin'];
        if (this.name && isBuiltinFn(this.name) && builtin) {
            builtin.call(this);
        }

        this.base('compile', arguments);
    },

    superBuiltin: function() {
        var
        methodName, cls,
        newNode,
        ch   = this.children,
        stub = '',        
        ctx  = this.yy.env.context();

        if (!(ctx.ownerNode.parent instanceof yy.MethodNode)) {
            this.error("can not call 'super' builtin function outside of method scope", ch[3].lineno);
        }

        cls = ctx.ownerNode.parent.parent.parent;
        
        if (!cls.superClassName) {
            this.error("callign 'super' inside a class which does not inherit", ch[3].lineno);
        }

        if (ctx.ownerNode.parent.isInitializer) {
            methodName = 'constructor';    
        }
        else {
            methodName = ctx.ownerNode.parent.name;
        }

        if (ch[2]) {
            stub += cls.superClassName + '.prototype.' + methodName + '.call';
            this.children[1].children = '(me, ';
            newNode = new yy.Lit(stub, ch[0].lineno);
            newNode.loc = ch[0].loc;
            this.children.splice(0, 1, newNode);
        }
        else {
            stub += cls.superClassName + '.prototype.' + methodName + '.apply';
            this.children[1].children = '(me, arguments';
            newNode = new yy.Lit(stub, ch[0].lineno);
            newNode.loc = ch[0].loc;
            this.children.splice(0, 1, newNode);
        }
    },
    
    errorBuiltin: function() {
        var ch = this.children;
        if (this.parent instanceof yy.SimpleStmtNode) {
            // no arguments
            if (!ch[2]) {
                ch[2] = new yy.Lit('_error', ch[0].lineno);
            }
            
            ch[0].children[0].children = 'throw';            
            ch.splice(1, 1);
            ch.splice(2, 1);
        }
        else {
            this.children = [
                new yy.Lit('_error', ch[0].lineno)
            ]
        }
    },


    regexBuiltin: function() {

        if (!this.children[2]) {
            this.error('invalid regular expression pattern', this.children[0].lineno);
        }

        var
        flags,
        ch      = this.children,
        params  = ch[2],
        patternNode = params.children[0],
        flagsNode   = params.children[2],
        regStart  = /^\'/,
        regEnd    = /\'$/,
        regDelim  = /\//g,
        strDelim  = "\\'",
        newLine   = /\n(\s+)?/g,
        rFlags    = /[gimy]+/,
        rEscape   = /\\(?=[bBdDsSwW])/g;

        function cleanPattern(p) {
            return p.replace(newLine, '').replace(regDelim, '\\/');
        }

        if (patternNode instanceof yy.StringNode && (flagsNode instanceof yy.StringNode || flagsNode == void 0)) {

            patternNode.children = cleanPattern(patternNode.children).replace(regStart, '\/')
                .replace(regEnd, '\/')
                .replace(newLine, '\\n')
                .replace(strDelim, "'");

            if (patternNode.children === '//') {
                this.error('invalid regular expression pattern', patternNode.lineno);
            }

            if (flagsNode) {
                flags = flagsNode.children.replace(regStart, '').replace(regEnd, '');

                if (flags !== '' && !rFlags.test(flags)) {
                    this.error('invalid regular expression flags', flagsNode.lineno);
                }

                patternNode.children += flags;
            }

            this.children = [
                patternNode
            ];

            return;
        } else {
            ch[0].children[0].children = this.runtimePrefix('regex');
        }

        if (patternNode instanceof yy.StringNode) {
            // special symbols
            // bBdDsSwW
            patternNode.children = cleanPattern(patternNode.children).replace(rEscape, '\\\\');
        }

    },

    chanBuiltin: function() {
        var ch = this.children;
        ch[0].children[0].children = this.runtimePrefix('chan');
    },

    timeoutBuiltin: function() {
        if (! isInGoExpr(this)) {
            this.error('unexpected timeout operation', this.lineno);
        }

        var ch = this.children;
        ch[0].children[0].children = this.runtimePrefix('timeout');
        ch.unshift(new yy.Lit((this.forSelect ? '' : 'yield '), getLesserLineNumber(ch[0])))
    },

    copyBuiltin: function() {
        var ch = this.children;
        ch[0].children[0].children = this.runtimePrefix('copy');
    }
});

yy.IfNode = Class(yy.Node, {

    type: 'IfNode',

    compile: function() {
        var
        ch = this.children;

        ch.splice(1, 0, new yy.Lit('(', ch[0].lineno));
        ch.splice(3, 0, new yy.Lit(') ', ch[2].lineno));
    }

});

yy.ElseNode = Class(yy.Node, {

    type: 'ElseNode',

    compile: function() {
        var
        ch = this.children;

        // else if
        if (ch.length === 2) {
            ch.splice(1, 0, new yy.Lit(' ', ch[0].lineno));
        }

    }

});


yy.SwitchNode = Class(yy.Node, {
    
    type: 'SwitchNode',

    compile: function() {
        this.base('initNode', arguments);
        var
        ch = this.children;
        // no expresion
        if (ch[1] === undefined) {
            ch[1] = new yy.Lit('true', ch[0].lineno);
        }
        ch.splice(1, 0, new yy.Lit('(', ch[0].lineno));
        ch.splice(3, 0, new yy.Lit(') ', ch[2].lineno));
    }

});

yy.CaseNode = Class(yy.Node, {

    type: 'CaseNode',

    compile: function() {
        this.base('compile', arguments);
        var
        ch = this.children, ls;

        this.handleFallThrough(ch[1]);

        //if is not "default"
        if (ch[3]) {
            ls = ch[3];
            ls.children.push(new yy.Lit(' break; ', ls.last().lineno - 1));
        }

    },

    handleFallThrough: function(exprList) {
        var i,
        ls = exprList.children,
        len = ls.length;

        for (i = 0; i < len; i++) {
            if (ls[i].children === ',') {
                ls[i].children = ': case ';
            }
        }
    }

});

yy.ForNode = Class(yy.Node, {

    type: 'ForNode',

    compile: function() {
        var ch = this.children, operation, chanName, block;

        if (ch.length <= 3) {
            ch[0].children = 'while ';
        }

        // channel receiving
        if (ch.length === 3 && ch[1] instanceof yy.AssignmentNode && ch[1].children[2] instanceof yy.ReceiveAsyncNode) {
            operation = ch[1];
            chanName  = operation.children[2].channelVarName;
            block     = ch[2];

            ch.splice(1, 1);

            block.children.splice(1, 0,
                new yy.Lit(
                    '; if (' + this.runtimePrefix('isChannel(') + chanName + ') && ' + chanName + '.closed) break;',
                    block.children[0].lineno
                )
            );

            block.children.splice(1, 0, operation);
        }

        if (ch.length === 2) {
            ch.splice(1, 0, new yy.Lit('true', ch[0].lineno));
        }

        ch.splice(1, 0, new yy.Lit('(', ch[0].lineno));
        ch.splice(ch.length - 1, 0, new yy.Lit(') ', getLesserLineNumber(ch[ch.length - 1])));
    }

});


// God save me.
yy.ForInNode = Class(yy.Node, {

    type: 'ForInNode',

    compile: function() {
        var
        ctx = yy.env.context(),
        ch = this.children,
        k, v, str1, str2, str3,
        $i, $len, $coll, $keys;

        if (ch.length === 5) {
            /*
            for v in coll { }
            for (var $coll = coll, $keys = CRL_keys($coll), $i = 0, $len = $keys.length, v; $i < $len; $i++) {v = $coll[$keys[$i]];}
            */
            v     = ch[1].children[0].children;
            $i    = ctx.generateVar('i');
            $len  = ctx.generateVar('len');
            $coll = ctx.generateVar('coll');
            $keys = ctx.generateVar('keys');

            str1 = '(var ' + $coll + ' = ';
            str2 = ', ' +
                   $keys + ' = ' + this.runtimeFn('keys') + $coll + '), ' +
                   $i + ' = 0, ' +
                   $len + ' = ' + $keys + '.length, ' +
                   v + '; ' +
                   $i + ' < ' + $len + '; ' +
                   $i + '++) ';
            str3 = v + ' = ' + $coll + '[' + $keys + '[' + $i + ']];';

            ch[1].markAsLocalVar();
            ch.splice(1, 2, new yy.Lit(str1, ch[2].lineno));
            ch.splice(3, 0, new yy.Lit(str2, ch[2].lineno));
            ch[4].children.splice(1, 0, new yy.Lit(str3, ch[4].children[0].lineno));

        }
        else {
            /*
            for k, v in coll { }
            for (var $coll = coll, $keys = CRL_keys($coll), $i = 0, $len = $keys.length, k, v; $i < $len; $i++) {k = $keys[$i]; v = $coll[k]; }
            */
            k     = ch[1].children[0].children;
            v     = ch[3].children[0].children;
            $i    = ctx.generateVar('i');
            $len  = ctx.generateVar('len');
            $coll = ctx.generateVar('coll');
            $keys = ctx.generateVar('keys');

            str1 = '(var ' + $coll + ' = ';
            str2 = ', ' +
                   $keys + ' = ' + this.runtimeFn('keys') + $coll + '), ' +
                   $i + ' = 0, ' +
                   $len + ' = ' + $keys + '.length, ' +
                   k + ', ' + v + '; ' +
                   $i + ' < ' + $len + '; ' +
                   $i + '++) ';
            str3 = k + ' = ' + $keys + '[' + $i + ']; ' +
                   v + ' = ' + $coll + '[' + k + '];';

            ch[1].markAsLocalVar();
            ch[3].markAsLocalVar();
            ch.splice(1, 4, new yy.Lit(str1, ch[4].lineno));
            ch.splice(3, 0, new yy.Lit(str2, ch[2].lineno));
            ch[4].children.splice(1, 0, new yy.Lit(str3, ch[4].children[0].lineno));
        }

    }

});

yy.ForInRangeNode = Class(yy.Node, {

    type: 'ForInRangeNode',

    compile: function() {
        var
        ctx = yy.env.context(),
        ch = this.children, i, from, to;

        i = ch[1].children[0].children;
        from = ch[3] || new yy.Lit('0', ch[0].lineno);
        to   = ch[5] || new yy.Lit('Infinity', ch[0].lineno);

        /*
        for i in n:m { }
        for (var i = n; i < m; i++) { }
        */
        this.children = [
            new yy.Lit('for (var ' + i + ' = ', ch[0].lineno),
            from,
            new yy.Lit('; ' + i + ' < ', from.lineno),
            to,
            new yy.Lit('; ' + i + '++) ', to.lineno),
            ch[6],
        ];
    }

});


yy.CatchNode = Class(yy.Node, {

    type: 'CatchNode',

    compile: function() {
        var
        ch = this.children;
        
        ch[0].children = 'try { ';
        ch.splice(2, 0, new yy.Lit('; } catch (_error) ', ch[1].lineno));
    }

});


yy.CoalesceNode = Class(yy.Node, {
    
    type: 'CoalesceNode',
    
    ref: null,
    
    initNode: function() {        
        if (this.children[0] instanceof yy.VarNode) {            
            this.ref = this.children[0].name;
        }
        else {             
            this.ref = yy.env.context().generateVar('ref');
            this.yy.env.context().addLocalVar(this.ref);
        }
    },
    
    compile: function() {
        var
        ref = this.ref,
        ch = this.children;
        
        // optimize resulting code ovoiding ref generation
        if (ch[0] instanceof yy.VarNode) {
            this.children = [
                ch[0],                
                new yy.Lit(' != null && '+ ref + ' != void 0 ? ' + ref + ' : ', ch[0].lineno),
                ch[2]
            ];
        }
        else {
            this.children = [
                new yy.Lit('(' + ref + ' = ', ch[0].lineno),
                ch[0],                
                new yy.Lit(', ' + ref + ' != null && '+ ref + ' != void 0 ? ' + ref + ' : ', ch[0].lineno),
                ch[2],
                new yy.Lit(')', ch[2].lineno),
            ];    
        }
    }
});


yy.ExistenceNode = Class(yy.Node, {

    type: 'ExistenceNode',
    
    ref: null,
    
    subject: null,
    
    init: function(sub) {
        this.subject = sub;
        if (sub instanceof yy.Lit) {
            this.error('Invalid operation with ' + sub.children, sub.lineno);
        }
        this.base('init', sub.children);
    },
    
    initNode: function() {
        if (this.children[0] instanceof yy.VarNode ) {
            this.ref = this.children[0].name;
        }
        else {             
            this.ref = yy.env.context().generateVar('ref');
            this.yy.env.context().addLocalVar(this.ref);
        }
    },
    
    compile: function() {
        var
        oldNode, newNode,
        condition,
        ref = this.ref,
        ch  = this.children;
        
        if (this.subject instanceof yy.VarNode) {
            ref = this.ref = this.subject.name = this.subject.name;
        }
        
        // if call node
        if (this.subject instanceof yy.CallNode) {
            condition = ' !== \'function\' ? ';
        }        
        // otherwise
        else {
            condition = ' === \'undefined\' || '+ ref + ' === null ? ';
        }
        
        // replace the first node of the
        // subject by new ref VarNode
        oldNode = this.subject.children[0];
        newNode = new yy.VarNode(oldNode.children);
        newNode.loc    = oldNode.loc;
        newNode.lineno = oldNode.lineno;
        newNode.name   = oldNode.name;

        this.subject.children[0] = newNode;
        
        // optimize resulting code avoiding ref generation
        if (ch[0] instanceof yy.VarNode) {
            this.children = [
                new yy.Lit('typeof ' + ref + condition, ch[0].lineno),
                new yy.Lit('void 0 : ' + ref, this.subject.lineno),
                this.subject,
            ];
        }
        else if (ch[0] instanceof yy.Lit) {
            this.children = [
                new yy.Lit('typeof ' + ref + condition, ch[0].lineno),
                new yy.Lit('void 0 : ' + ref, this.subject.lineno),
                this.subject,
            ];
        }
        else {
            this.children = [
                new yy.Lit('typeof (' + ref + ' = ', ch[0].lineno),
                ch[0],
                new yy.Lit(')' + condition, ch[0].lineno),
                new yy.Lit('void 0 : ' + ref, ch[ch.length - 1].lineno),
                this.subject,
            ];    
        }

        // re-adopt
        this.adopt(this.children);
    }
});


yy.UnaryExistenceNode = Class(yy.ExistenceNode, {

    type: 'UnaryExistenceNode',

    initNode: function() {
        var ch = this.children;

        if (ch.length == 1 && (this.subject instanceof yy.VarNode)) {
            this.ref = this.subject.name;
            this.usingVar = true;
        } else {
            this.ref = yy.env.context().generateVar('ref');
            this.yy.env.context().addLocalVar(this.ref);
        }
    },

    compile: function() {
        var
        ch        = this.children,
        ref       = this.ref,
        condition = '!(typeof ' + ref + ' === \'undefined\' || ' + ref + ' === null)';

        if (this.usingVar) {
            ch.splice(0, 1);
        } else {
            ch.splice(0, 0, new yy.Lit('((' + ref + ' = ', getLesserLineNumber(ch[0])));
            ch.push(new yy.Lit('), ', this.lineno));
            condition += ')';
        }

        ch.push(new yy.Lit(condition, this.lineno));
    }

})


// check if a node is inside a `go` expression
function isInGoExpr(node) {
    var goExprFound = false;

    while(node.parent) {
        node = node.parent;

        if (node instanceof yy.ContextAwareNode && !goExprFound) {
            return false;
        }

        if (node instanceof yy.GoExprNode) {
            goExprFound = true;
        }
    }

    return goExprFound;
}

yy.GoExprNode = Class(yy.Node, {

    type: 'GoExprNode',

    compile: function() {
        var
        ch     = this.children,
        fnNode = ch[1];
        ch[0].children = this.runtimePrefix('go(function* go()');

        fnNode.children[fnNode.children.length - 1].children += ', this)';
    }
})

yy.SendAsyncNode = Class(yy.Node, {

    type: 'SendAsyncNode',

    initNode: function() {
        this.base('initNode', arguments);
        var ctx;

        if (this.children[0] instanceof yy.VarNode) {
            this.channelVarName = this.children[0].name;
        } else {
            ctx = this.yy.env.context();
            this.channelVarName = ctx.generateVar('ch');
            ctx.addLocalVar(this.channelVarName);    
        }
    },

    compile: function() {
        if (! isInGoExpr(this)) {
            this.error('unexpected async operation', this.lineno);
        }

        var
        newChildren,
        ch    = this.children,
        isVar = ch[0] instanceof yy.VarNode;

        if (isVar) {
            newChildren = [];
        } else {
            newChildren = [
                new yy.Lit('(', ch[0].lineno),
                new yy.Lit(this.channelVarName + ' = ', ch[0].lineno),
                ch[0],
                new yy.Lit(',', ch[0].lineno),
            ];
        }

        this.children = newChildren.concat([
            this.compileRequest(),
            new yy.Lit('&&', ch[0].lineno)
        ].concat(this.compilePerform()));

        if (isUsedAsStatement(this)) {
            this.children.unshift(new yy.Lit(';', ch[0].lineno));
        }

        if (!isVar) {
            this.children.push(new yy.Lit(')', ch[ch.length - 1].lineno));
        }
    },

    compileRequest: function() {
        var
        ch = this.children;

        return new yy.Lit('(yield ' + this.runtimeFn('requestSend') + this.channelVarName + '))', ch[0].lineno);
    },

    compilePerform: function() {
        var
        ch = this.children;
        return [
            new yy.Lit('(yield ' + this.runtimeFn('performSend') + this.channelVarName + ', ', ch[2].lineno),
            ch[2],
            new yy.Lit('))', ch[2].lineno)
        ]
    }
})

yy.ReceiveAsyncNode = Class(yy.Node, {

    type: 'ReceiveAsyncNode',

    forSelect: false,

    initNode: function() {
        this.base('initNode', arguments);
        var ctx;

        if (this.children[1] instanceof yy.VarNode) {
            this.channelVarName = this.children[1].name;
        } else {
            ctx = this.yy.env.context();
            this.channelVarName = ctx.generateVar('ch');
            ctx.addLocalVar(this.channelVarName);    
        }
    },

    compile: function() {
        if (! isInGoExpr(this)) {
            this.error('unexpected async operation', this.lineno);
        }

        var
        newChildren,
        ch    = this.children,
        isVar = ch[1] instanceof yy.VarNode;

        if (isVar) {
            newChildren = [];
        } else {
            newChildren = [
                new yy.Lit('(', ch[0].lineno),
                new yy.Lit(this.channelVarName + ' = ', ch[0].lineno),
                ch[1],
                new yy.Lit(',', ch[1].lineno),
            ];
        }

        if (this.forSelect) {
            this.children = newChildren.concat([
                this.compileRequest()
            ]);
        } else {
            this.children = newChildren.concat([
                this.compileRequest(),
                new yy.Lit('? ', ch[1].lineno),
                new yy.Lit('(', ch[1].lineno),
                this.compilePerform(),
                new yy.Lit(')', ch[1].lineno),
                new yy.Lit(': void 0', ch[1].lineno)
            ]);
        }

        if (isUsedAsStatement(this)) {
            this.children.unshift(new yy.Lit(';', ch[0].lineno));
        }

        if (!isVar) {
            this.children.push(new yy.Lit(')', ch[ch.length - 1].lineno));
        }
    },

    compileRequest: function(lineno) {
        var
        ch = this.children,
        fnName = this.forSelect ? 'requestRecvForSelect': 'requestRecv';

        lineno = lineno || ch[1].lineno;

        return new yy.Lit(
            (this.forSelect ? '' : '(yield ') +
            this.runtimeFn(fnName) +
            this.channelVarName +
            (this.forSelect ? ')' : '))'),
        lineno);
    },

    compilePerform: function(lineno) {
        var
        ch = this.children;

        lineno = lineno || ch[1].lineno;

        return new yy.Lit('yield ' + this.runtimeFn('performRecv')  + this.channelVarName + ')' + (this.forSelect ? ';' : ''), lineno)
    }
})


yy.TemplateLiteralNode = Class(yy.Node, {

    type: 'TemplateLiteralNode',

    compile: function() {
        var str, list, i, len, item,
        ch = this.children;

        if (ch.length === 1) {
            // simple template
            ch[0] = new yy.StringNode(ch[0].children.substr(1), ch[0].loc);
        } else {
            // interpolation
            str = ch[0].children;
            ch[0] = new yy.StringNode(str.substring(1, str.length-1) + "' + ", ch[0].loc);

            str = ch[2].children;
            ch[2] = new yy.StringNode(" + '" + str.substring(1), ch[2].loc);

            list = ch[1];

            for (i = -1, len = list.children.length-2; i < len;) {
                i+=2;
                item = list.children[i];
                str  = item.children;
                list.children[i] = new yy.StringNode(" + '" + str.substring(1, str.length-1) + "' + ", item.loc);
            }
        }
    }
})

yy.SelectNode = Class(yy.Node, {

    type: 'SelectNode',

    processOperations: function() {
        var
        i, len, singleCase, cases,
        leftHand, operator, body,
        lineno = getLesserLineNumber(this),
        count = 0, ch  = this.children,
        collectedCases = [],
        caseStmtList   = ch[0].children[1].children;

        for (i = 0, len = caseStmtList.length; i < len; i++) {

            singleCase = caseStmtList[i].children[1];

            if (
                singleCase instanceof yy.ReceiveAsyncNode ||
                (singleCase instanceof yy.CallNode && singleCase.name == 'timeout') ||
                singleCase instanceof yy.AssignmentNode
            ) {
                // process asignement node
                if (singleCase instanceof yy.AssignmentNode) {
                    if (singleCase.children[2] instanceof yy.ReceiveAsyncNode) {
                        leftHand = singleCase.children.shift();
                        operator = singleCase.children.shift();

                        singleCase = singleCase.children[0];
                        singleCase.forSelect = true;

                        body = caseStmtList[i].children[3];
                        body.addFront(leftHand, operator, singleCase.compilePerform(operator.lineno));
                    } else {
                        this.error('unexpected ' + singleCase.type, singleCase.lineno);
                    }
                }

                singleCase.forSelect = true;
                collectedCases.push(singleCase);

                // setup case numbers
                caseStmtList[i].children[1] = new yy.Lit(String(count++), getLesserLineNumber(singleCase));
            } else {
                this.error('unexpected ' + singleCase.type, singleCase.lineno);
            }
        }

        // flatten
        for (i = 0, len = collectedCases.length; i < len; i++) {
            flattenToLine(collectedCases[i], lineno);
        }

        // insert commas
        for (i = 1; i < collectedCases.length; i+=2) {
            collectedCases.splice(i, 0, new yy.Lit(',', lineno));
        }

        this.children = collectedCases.concat(ch)
    },

    compile: function() {
        var
        ch    = this.children,
        first = ch[0];

        // remove first child
        ch.shift();

        // proc
        this.processOperations();

        ch = this.children;
        ch.splice(0, 0, new yy.Lit('(yield ' + this.runtimeFn('select') + '[', getLesserLineNumber(this)));

        first.children = 'switch';
        ch.unshift(first);

        ch.splice(ch.length-1, 0, new yy.Lit('])) ', ch[ch.length-2].lineno))
    }

})

yy.SelectCaseNode = Class(yy.Node, {

    type: 'SelectCaseNode',

    compile: function() {
        var ls = this.children[3];
        ls.children.push(new yy.Lit(' break; ', ls.last().lineno - 1));
    }

})

})(typeof cor === 'undefined' ? {} : cor);
