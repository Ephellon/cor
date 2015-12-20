(function(cor){

var EcmaReservedKeywords = [
    // Ecma-262 Keyword
    'break', 'do', 'instanceof', 'typeof',
    'case', 'else', 'new', 'var',
    'catch', 'finally', 'return', 'void',
    'continue', 'for', 'switch', 'while',
    'debugger', 'function', 'this', 'with',
    'default', 'if', 'throw',
    'delete', 'in', 'try',

    // Ecma-262 FutureReservedWord
    'class', 'enum', 'extends', 'super',
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

yy.parseError = function parseError (msg, hash, replaceMsg) {
    var filename = yy.env.filename;
    //is non recoverable parser error?
    if (hash && hasProp.call(hash, 'loc') && hash.expected) {
        switch (hash.text) {
            case '\n': hash.text = 'NEW_LINE';       break;
            case ''  : hash.text = 'END_OF_PROGRAM'; break;
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
There is three types of routes:

- Inner    : begins with . char, example: `.models`
- Delegate : ends with file extensions, example `filename.js`
- Public   : is tested against `^[a-z_-]+$` regex

Routes are tested in the same order as types above, if the route does not match to
any of before types then it will be proccessed by `packagize` function which transform
routes according to Cor package convention.
*/
yy.generateRoute = function(route) {    
    var
    parsed, ext,
    rFileNameExt   = /([\s\S]+)*(^|\/)([\w\-]+)*(\.[\w\-]+)*$/,
    rCapitalLetter = /^[A-Z]/,
    rStatic        = /^(\.\.\/)|(\.\/)|(\/)/,
    rInner         = /^\.([\w-]+)$/,
    rPublic        = /^[a-z_-]+$/;
    
    // replace \ by /
    function normalize(route) {
        return route.replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    // apply Cor package convention
    function packagize(route) {
        var
        parsed = rFileNameExt.exec(route);

        if (parsed && parsed[3] && !parsed[4] && !rCapitalLetter.test(parsed[3])) {
            route = (parsed[1] || '') + parsed[2] + parsed[3] + '/' + parsed[3];
        }
        else if (!parsed[3]) {
            return null;
        }

        return normalize(route);
    }

    // Inner
    parsed = rInner.exec(route);
    if (parsed) {
        return normalize('./' + parsed[1]);
    }

    // Public
    if (rPublic.test(route)) {
        return normalize(route);
    }
    
    // Delegate
    // parsed[4] is the file extension
    // so if parsed[4]? then is delegate route
    parsed = rFileNameExt.exec(route);
    if (parsed[4]) {
        return normalize(route);
    }

    // else process by applying Cor package convention
    return packagize(route);
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
        if (fn(ch[i]) === false) {
            return;
        }
        preorder(ch[i], fn);
    }
}

function flattenToLine(node, lineno) {
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

    runtimePrefix: 'CRL.',

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
        return this.runtimePrefix + name + '(';
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
    },

    addFront: function() {
        this.children = slice.call(arguments).concat(this.children);
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
        exported = this.yy.env.getExported();

        for (name in exported) {
            if (name !== this.initializerName) {
                ret += 'exports.' + name + ' = ' + exported[name] + '; ';
            }
        }
        return ret;
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
        if (!this.children[5]) {
            this.children[5] = new yy.Node(
                new yy.Lit('{', ch[4].lineno),
                new yy.List(),
                new yy.Lit('}', ch[4].lineno)
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

        this.from = this.children[2];
        this.to   = this.children[4];
    },
    
    compile: function() {
        var
        num, lit,
        openParen  = '(',
        closeParen = ')',
        from       = this.from,
        to         = this.to,
        ch         = this.children;

        if (from === undefined) {
            from = new yy.Lit('0', ch[1].lineno);
        }

        this.children = [
            ch[0],
            new yy.Lit('.slice(', ch[1].lineno),
            from
        ];

        if (to !== undefined) {
            if (to instanceof yy.UnaryExprNode && typeof to.children[1].children === 'string') {
                lit     = new yy.Lit(stringifyNode(to), to.lineno);
                lit.loc = to.children[1].loc;
                to      = lit;
            }

            if (to instanceof yy.Lit) {
                to.children =  this.transformLiteral(to.children);
                this.children.push(
                    new yy.Lit(', ', ch[3].lineno),
                    to
                );
            }
            else {
                if (to instanceof yy.AssociationNode) {
                    openParen  = '';
                    closeParen = '';
                }
                this.children.push(
                    new yy.Lit(', +' + openParen, ch[3].lineno),
                    to, 
                    new yy.Lit(closeParen + ' + 1 || 9e9', to.lineno)
                );
            }
        }

        this.children.push(new yy.Lit(')', ch[5].lineno));
    },    

    transformLiteral: function(l) {
        var num = parseInt(l);
        if (! isNaN(num)) {
            return String(+(num)+1);
        }
        else {
            return l;
        }
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
        lineno   = this.lineno,
        splitted = this.children.split(/\r\n|\n/),
        len      = splitted.length;

        for (i = 0; i < len; i++) {
            str = splitted[i].replace(/^\s+/, '');
            if (i < len - 1) {
                str += '\\';
            }
            splitted[i] = new yy.Lit(str, lineno + i);
        }

        this.children = splitted;
    }
});

yy.UseNode = Class(yy.Node, {

    type: 'UseNode',

    rAlias: /([\w\-]+)*(?:\.[\w\-]+)*$/,

    rCapitalLetter: /^[A-Z]/,

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
        alias  = this.alias || this.extractedAlias,
        suffix = '';

        if (this.rCapitalLetter.test(this.extractedAlias)) {
            suffix = '.' + alias;
        }

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
            new yy.Lit(')' + suffix + ';', ch[1].lineno)
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
        var i, len,
        extendsStr   = '',
        ch           = this.children;

        if (this.superClassName) {
            extendsStr = ', ' + this.superClassName;
        }

        this.children = [
            new yy.Lit(this.className + ' = function ' + this.className, ch[0].lineno),
            this.methodSet
        ];

        if (this.superClassName) {
            this.methodSet.children[0].children[1].children += this.runtimeFn('extend') + this.className + extendsStr +');';
        }
    },

    compileWithoutInit: function() {
        var i, len,
        ch = this.children,
        superInitStr   = '',
        extendsStr     = '',
        applyConfStr   = '',
        prepareInitStr = '',
        runInitStr     = '' + applyConfStr + '',
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

        this.children = [
            new yy.Lit(this.className + ' = function ' + this.className, ch[0].lineno),
            new yy.Lit('('+ argsStr +'){' + prepareInitStr + superInitStr , ch[1].lineno),
            this.propertySet,
            new yy.Lit(runInitStr + '};', this.propertySet.lineno)
        ];

        if (this.superClassName) {
            this.children.push(new yy.Lit(this.runtimeFn('extend') + this.className + extendsStr +');', this.propertySet.lineno))
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

        if (this.name) {
            builtin = this[this.name + 'Builtin'];
            if (builtin) {
                builtin.call(this);
            }
        }

        this.base('compile', arguments);
    },

    superBuiltin: function() {
        var
        methodName, cls,
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
            this.children.splice(0, 1, new yy.Lit(stub, ch[0].lineno));
        }
        else {
            stub += cls.superClassName + '.prototype.' + methodName + '.apply';
            this.children[1].children = '(me, arguments';
            this.children.splice(0, 1, new yy.Lit(stub, ch[0].lineno));
        }

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
            ls = ch[3].children[0].children;
            ls.push(new yy.Lit(' break; ', ls[ls.length - 1].lineno));
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
        var ch = this.children;

        if (ch.length <= 3) {
            ch[0].children = 'while ';
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
        ch = this.children,
        k, v, str1, str2, str3,
        $i, $len, $coll, $keys;

        if (ch.length === 5) {
            /*
            for v in coll { }
            for (var $coll = coll, $keys = CRL_keys($coll), $i = 0, $len = $keys.length, v; $i < $len; $i++) {v = $coll[$keys[$i]];}
            */
            v     = ch[1].children[0].children;
            $i    = yy.env.generateVar('i');
            $len  = yy.env.generateVar('len');
            $coll = yy.env.generateVar('coll');
            $keys = yy.env.generateVar('keys');

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
            $i    = yy.env.generateVar('i');
            $len  = yy.env.generateVar('len');
            $coll = yy.env.generateVar('coll');
            $keys = yy.env.generateVar('keys');

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

yy.TryNode = Class(yy.Node, {

    type: 'TryNode',

    compile: function() {
        var
        ch = this.children;

        if (!ch[2]) {
            this.children.push(new yy.Lit('catch($error){}', this.lineno));
        }
    }

});

yy.CatchNode = Class(yy.Node, {

    type: 'CatchNode',

    compile: function() {
        var
        ch = this.children;

        if (ch[1]) {
            ch[1].children = '(' + ch[1].children + ') ';
        }
    }

});


})(typeof cor === 'undefined' ? {} : cor);
