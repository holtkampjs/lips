/* global require, describe, it, expect, jest */

var lips = require('../src/lips');


var {
    parse,
    tokenize,
    evaluate,
    Pair,
    Symbol,
    nil,
    Environment,
    global_environment,
    LNumber
} = lips;

describe('tokenizer', function() {
    it('should create tokens for simple list', function() {
        expect(tokenize('(foo bar baz)')).toEqual(['(', 'foo', 'bar', 'baz', ')']);
    });
    it('should create tokens for numbers string and regexes', function() {
        expect(tokenize('(foo /( \\/)/g "bar baz" 10 1.1 10e2)')).toEqual([
            '(', 'foo', '/( \\/)/g', '"bar baz"', '10', '1.1', '10e2', ')'
        ]);
    });
    it('should create tokens for alists', function() {
        expect(tokenize('((foo . 10) (bar . 20) (baz . 30))')).toEqual([
            '(', '(', 'foo', '.', '10', ')', '(', 'bar', '.', '20', ')', '(',
            'baz', '.', '30', ')', ')'
        ]);
    });
    it('should ignore comments', function() {
        expect(tokenize('(foo bar baz); (baz quux)')).toEqual([
            '(', 'foo', 'bar', 'baz', ')'
        ]);
    });
    it('should handle semicolon in regexes and strings', function() {
        expect(tokenize('(";()" /;;;/g baz); (baz quux)')).toEqual([
            '(', '";()"', '/;;;/g', 'baz', ')'
        ]);
    });
});
describe('parser', function() {
    it('should create Pair for simple list', function() {
        var tokens = tokenize('(foo bar baz)');
        var array = parse(tokens);
        expect(array.length).toBe(1);
        expect(array[0]).toEqual(
            new Pair(
                new Symbol('foo'),
                new Pair(
                    new Symbol('bar'),
                    new Pair(
                        new Symbol('baz'),
                        nil
                    )
                )
            )
        );
    });
    it('should create regular expressions numbers and strings', function() {
        var tokens = tokenize('(foo /( \\/)/g "bar baz" 10 1.1 10e2)');
        var array = parse(tokens);
        expect(array[0]).toEqual(
            new Pair(
                new Symbol('foo'),
                new Pair(
                    /( \/)/g,
                    new Pair(
                        'bar baz',
                        new Pair(
                            LNumber(10),
                            new Pair(
                                LNumber(1.1),
                                new Pair(
                                    LNumber(10e2),
                                    nil
                                )
                            )
                        )
                    )
                )
            )
        );
    });
    it('should create AList', function() {
        var tokens = tokenize('((foo . 10) (bar . 20) (baz . 30))');
        var array = parse(tokens);
        expect(array[0]).toEqual(
            new Pair(
                new Pair(
                    new Symbol('foo'),
                    LNumber(10)
                ),
                new Pair(
                    new Pair(
                        new Symbol('bar'),
                        LNumber(20)
                    ),
                    new Pair(
                        new Pair(
                            new Symbol('baz'),
                            LNumber(30)
                        ),
                        nil
                    )
                )
            )
        );
    });
});

describe('Pair', function() {
    const pairs = new Pair(
        1,
        new Pair(
            2,
            new Pair(
                new Pair(
                    3,
                    new Pair(
                        4,
                        nil)
                ),
                new Pair(
                    new Pair(
                        5,
                        new Pair(
                            6,
                            nil
                        )
                    ),
                    nil
                )
            )
        )
    );
    const array = [1, 2, [3, 4], [5, 6]];
    it('should create Pair structure from array', function() {
        expect(Pair.fromArray(array)).toEqual(pairs);
    });
    it('should create Array from list structure', function() {
        expect(pairs.toArray()).toEqual(array);
    });
    it('should return same array', function() {
        var array = [[1], 2, [3, 4], [5, [1, [2, 3]], [1, 2]]];
        expect(Pair.fromArray(array).toArray()).toEqual(array);
    });
});

function exec(string, env, dynamic_scope) {
    return evaluate(parse(tokenize(string))[0], env, dynamic_scope);
}

describe('evaluate', function() {
    const rand = Math.random();
    const env = new Environment({
        value: rand,
        fun: function(a, b) {
            if (LNumber.isNumber(a)) {
                return LNumber(a).add(b);
            } else if (typeof a === 'string') {
                return a + b;
            }
        },
        f2: (a, b) => new Pair(a, new Pair(b, nil))
    }, global_environment, 'test');
    it('should return value', function() {
        expect(exec('value', env)).toEqual(LNumber(rand));
    });
    it('should call function', function() {
        expect(exec('(fun 1 2)', env)).toEqual(LNumber(3));
        expect(exec('(fun "foo" "bar")', env)).toEqual("foobar");
    });
    it('should set environment', function() {
        exec('(define x "foobar")', env);
        expect(exec('x', env)).toEqual("foobar");
        expect(exec('x')).toEqual(undefined);
    });
    it('should create list', function() {
        expect(exec('(cons 1 (cons 2 (cons 3 nil)))'))
            .toEqual(Pair.fromArray([LNumber(1), LNumber(2), LNumber(3)]));
    });
    describe('quote', function() {
        it('should return literal list', function() {
            expect(exec(`'(1 2 3 (4 5))`)).toEqual(
                Pair.fromArray([
                    LNumber(1),
                    LNumber(2),
                    LNumber(3),
                    [LNumber(4), LNumber(5)]
                ])
            );
        });
        it('should return alist', function() {
            expect(exec(`'((foo . 1)
                           (bar . 2.1)
                           (baz . "string")
                           (quux . /foo./g))`)).toEqual(
                new Pair(
                    new Pair(
                        new Symbol('foo'),
                        LNumber(1)
                    ),
                    new Pair(
                        new Pair(
                            new Symbol('bar'),
                            LNumber(2.1)
                        ),
                        new Pair(
                            new Pair(
                                new Symbol('baz'),
                                "string"
                            ),
                            new Pair(
                                new Pair(
                                    new Symbol('quux'),
                                    /foo./g
                                ),
                                nil
                            )
                        )
                    )
                )
            );
        });
    });
    describe('quasiquote', function() {
        it('should create list with function call', function() {
            expect(exec('`(1 2 3 ,(fun 2 2) 5)', env)).toEqual(
                Pair.fromArray([1, 2, 3, 4, 5].map(LNumber))
            );
        });
        it('should create list with value', function() {
            expect(exec('`(1 2 3 ,value 4)', env)).toEqual(
                Pair.fromArray([1, 2, 3, rand, 4].map(LNumber))
            );
        });
        it('should create single list using uquote-splice', function() {
            expect(exec('`(1 2 3 ,@(f2 4 5) 6)', env)).toEqual(
                Pair.fromArray([1, 2, 3, 4, 5, 6].map(LNumber))
            );
        });
        it('should create single pair', function() {
            [
                '`(1 . 2)',
                '`(,(car (list 1 2 3)) . 2)',
                '`(1 . ,(cadr (list 1 2 3)))',
                '`(,(car (list 1 2 3)) . ,(cadr (list 1 2 3)))'
            ].forEach((code) => {
                expect(exec(code)).toEqual(new Pair(LNumber(1), LNumber(2)));
            });
        });
        it('should create list from pair syntax', function() {
            expect(exec('`(,(car (list 1 2 3)) . (1 2 3))')).toEqual(
                Pair.fromArray([LNumber(1), LNumber(1), LNumber(2), LNumber(3)])
            );
        });
        it('should create alist with values', function() {
            expect(exec(`\`((1 . ,(car (list 1 2)))
                            (2 . ,(cadr (list 1 "foo"))))`))
                .toEqual(
                    new Pair(
                        new Pair(LNumber(1), LNumber(1)),
                        new Pair(new Pair(LNumber(2), "foo"), nil))
                );
            expect(exec(`\`((,(car (list "foo")) . ,(car (list 1 2)))
                            (2 . ,(cadr (list 1 "foo"))))`))
                .toEqual(new Pair(
                    new Pair("foo", LNumber(1)),
                    new Pair(
                        new Pair(LNumber(2), "foo"),
                        nil
                    )));
        });
        it('should process nested backquote', function() {
            expect(exec('`(1 2 3 ,(cadr `(1 ,(concat "foo" "bar") 3)) 4)')).toEqual(
                Pair.fromArray([
                    LNumber(1), LNumber(2), LNumber(3), "foobar", LNumber(4)
                ])
            );
        });
        it('should process multiple backquote/unquote', function() {
            expect(exec('``(a ,,(+ 1 2) ,(+ 3 4))')).toEqual(
                Pair.fromArray([
                    new Symbol('quasiquote'),
                    [
                        new Symbol('a'),
                        [
                            new Symbol('unquote'),
                            LNumber(3)
                        ],
                        [
                            new Symbol('unquote'),
                            [
                                new Symbol('+'),
                                LNumber(3),
                                LNumber(4)
                            ]
                        ]
                    ]
                ]));
        });
    });
    describe('trampoline', function() {
        var code = `(define Y
                       (lambda (h)
                          ((lambda (x) (x x))
                           (lambda (g)
                             (h (lambda args (apply (g g) args)))))))

                    (define (trampoline f)
                         (lambda args
                            (let ((result (apply f args)))
                                (while (eq? (type result) "function")
                                   (set result (result)))
                                result)))

                     (define (! n)
                        ((trampoline (Y (lambda (f)
                                         (lambda (n acc)
                                           (if (== n 0)
                                               acc
                                             (lambda ()
                                                 (f (- n 1) (* n acc)))))))) n 1))

                       (string (! 1000))`;
        var factorial_1000 = [
            "402387260077093773543702433923003985719374864210714632543799910",
            "429938512398629020592044208486969404800479988610197196058631666",
            "872994808558901323829669944590997424504087073759918823627727188",
            "732519779505950995276120874975462497043601418278094646496291056",
            "393887437886487337119181045825783647849977012476632889835955735",
            "432513185323958463075557409114262417474349347553428646576611667",
            "797396668820291207379143853719588249808126867838374559731746136",
            "085379534524221586593201928090878297308431392844403281231558611",
            "036976801357304216168747609675871348312025478589320767169132448",
            "426236131412508780208000261683151027341827977704784635868170164",
            "365024153691398281264810213092761244896359928705114964975419909",
            "342221566832572080821333186116811553615836546984046708975602900",
            "950537616475847728421889679646244945160765353408198901385442487",
            "984959953319101723355556602139450399736280750137837615307127761",
            "926849034352625200015888535147331611702103968175921510907788019",
            "393178114194545257223865541461062892187960223838971476088506276",
            "862967146674697562911234082439208160153780889893964518263243671",
            "616762179168909779911903754031274622289988005195444414282012187",
            "361745992642956581746628302955570299024324153181617210465832036",
            "786906117260158783520751516284225540265170483304226143974286933",
            "061690897968482590125458327168226458066526769958652682272807075",
            "781391858178889652208164348344825993266043367660176999612831860",
            "788386150279465955131156552036093988180612138558600301435694527",
            "224206344631797460594682573103790084024432438465657245014402821",
            "885252470935190620929023136493273497565513958720559654228749774",
            "011413346962715422845862377387538230483865688976461927383814900",
            "140767310446640259899490222221765904339901886018566526485061799",
            "702356193897017860040811889729918311021171229845901641921068884",
            "387121855646124960798722908519296819372388642614839657382291123",
            "125024186649353143970137428531926649875337218940694281434118520",
            "158014123344828015051399694290153483077644569099073152433278288",
            "269864602789864321139083506217095002597389863554277196742822248",
            "757586765752344220207573630569498825087968928162753848863396909",
            "959826280956121450994871701244516461260379029309120889086942028",
            "510640182154399457156805941872748998094254742173582401063677404",
            "595741785160829230135358081840096996372524230560855903700624271",
            "243416909004153690105933983835777939410970027753472000000000000",
            "000000000000000000000000000000000000000000000000000000000000000",
            "000000000000000000000000000000000000000000000000000000000000000",
            "000000000000000000000000000000000000000000000000000000000000000",
            "000000000000000000000000000000000000000000000000"].join('');
        var env = global_environment.inherit('trampoline');
        it('should calculate factorial using Y (TOC)', function() {
            var result = lips.exec(code, env);
            return result.then(function(result) {
                expect(result).toEqual([
                    undefined,
                    undefined,
                    undefined,
                    factorial_1000
                ]);
            });
        });
        it('should throw exception', function() {
            return lips.exec(code, env, env).catch(e => {
                expect(e).toEqual(new Error("Variable `f' is not a function"));
            });
        });
    });
});
describe('environment', function() {
    const env = global_environment;
    var functions = {
        scope_name: function() {
            return this.name;
        }
    };
    it('should return name of the enviroment', function() {
        var e = env.inherit(functions, 'foo');
        return lips.exec('(scope_name)', e).then(result => {
            return expect(result).toEqual(['foo']);
        });
    });
    it('should create default scope name', function() {
        var e = env.inherit(functions);
        return lips.exec('(scope_name)', e).then(result => {
            return expect(result).toEqual(['child of global']);
        });
    });
    it('should create default scope name for child scope', function() {
        var e = env.inherit(functions, 'foo');
        var child = e.inherit();
        return lips.exec('(scope_name)', child).then(result => {
            return expect(result).toEqual(['child of foo']);
        });
    });
});
describe('scope', function() {
    const ge = global_environment;
    function exec(code, dynamic_scope) {
        var env = ge.inherit();
        return lips.exec(code, env, dynamic_scope ? env : undefined);
    }
    describe('lexical', function() {
        it('should evaluate let', function() {
            return exec(`(define x 10) (let ((x 10)) x)`).then((result) => {
                expect(result).toEqual([undefined, LNumber(10)]);
            });
        });
        it('should evaluate let over let', function() {
            var code = `(define x 10)
                        (let ((x 20)) (let ((x 30)) x))`;
            return exec(code).then(result => {
                expect(result).toEqual([undefined, LNumber(30)]);
            });
        });
        it('should evalute lambda', function() {
            var code = `(define x 10)
                        ((let ((x 20)) (lambda () x)))`;
            return exec(code).then((result) => {
                expect(result).toEqual([undefined, LNumber(20)]);
            });
        });
        it('sould create closure', function() {
            var code = `(define fn (let ((x 10))
                                      (let ((y 20)) (lambda () (+ x y)))))
                        (fn)`;
            return exec(code).then(result => {
                expect(result).toEqual([undefined, LNumber(30)]);
            });
        });
    });
    describe('dynamic', function() {
        it('should get value from let', function() {
            var code = `(define fn (lambda (x) (* x y)))
                        (let ((y 10)) (fn 20))`;
            return exec(code, true).then(result => {
                expect(result).toEqual([undefined, LNumber(200)]);
            });
        });
        it('should evalute simple lambda', function() {
            var code = `(define y 20)
                        (define (foo x) (* x y))
                        ((lambda (y) (foo 10)) 2)`;
            return exec(code, true).then(result => {
                expect(result).toEqual([undefined, undefined, LNumber(20)]);
            });
        });
        it('should evalute let over lambda', function() {
            var code = `(define y 10)
                        ((let ((y 2)) (lambda () y)))`;
            return exec(code, true).then(result => {
                expect(result).toEqual([undefined, LNumber(10)]);
            });
        });
    });
});


/*

var code = parse(tokenize(`
    (print (cons 1 (cons 2 (cons 3 nil))))
    (print (list 1 2 3 4))
    (print (car (list 1 2 3)))
    (print (concat "hello" " " "world"))
    (print (append (list 1 2 3) (list 10)))
    (print nil)
    (define x 10)
    (print (* x x))
    (print (/ 1 2))
    (define l1 (list 1 2 3 4))
    (define l2 (append l1 (list 5 6)))
    (print l1)
    (print l2)
    (defmacro (foo code) \`(print ,(string (car code))))
    (foo (name baz))
    (print \`(,(car (list "a" "b" "c")) 2 3))
    (print \`(,@(list 1 2 3)))
    (print \`(1 2 3 ,@(list 4 5) 6))
    (defmacro (xxx code) \`(list 1 ,(car (cdr code)) 2))
    (print (xxx ("10" "20")))
    (if (== 10 20) (print "1 true") (print "1 false"))
    (if (== 10 10) (print "2 true") (print "2 false"))
    (print (concat "if " (if (== x 10) "10" "20")))
`));

(function() {
  var env = new Environment({}, global_environment);
  var c = parse(tokenize([
    "(define x '(1 2 3))",
    "(print x)",
    "(print `(1 2 ,@x 4 5))",
    "(print `(foo bar ,@x 4 5))"
  ].join(' ')));
  c.forEach(function(code) {
    console.log(code.toString());
    try {
      evaluate(code, env);
    } catch (e) {
      console.error(e.message);
    }
  })
})();
*/
