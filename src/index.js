const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const { promisify, inspect } = require('util');
const mime = require('mime');
const zlib = require('zlib');
const handlebars = require('handlebars');
const chalk = require('chalk');
process.env.DEBUG = 'static-server:*';
//  命名特点：项目名+模块名
//  每个deBug实例都有一个名字，是否在控制台打印取决于环境变量中debug的值是否等于static:app
//  set DEBUG=static:app，set命令是window特有的设置环境变量的命令，mac下是export
const debug = require('debug')('static-server:app');
const stat = promisify(fs.stat);

class Server {
    constructor(argv) {
        this.config = Object.assign({}, this.config, argv);
    }

    start() {
        const server = http.createServer(this.request.bind(this));
        server.listen(this.config.port, () => {
            const url = `http://${this.config.host}:${this.config.port}`;
            debug(`start server at ${chalk.green(url)}`);
        });
    }

    async request(req,res) {
        const { pathname } = url.parse(req.url);
        if (pathname === '/favicon.ico') {
            res.statusCode = 404;
            res.end();
            return;
        }
        const filePath = path.join(this.config.root, pathname);
        console.log(filePath)
        console.log(this.config.root)
        const statObj = await stat(filePath).catch((err) => {
            this.sendError(res, err);
        });
        try {
            // 访问的是文件夹目录
            if (statObj.isDirectory()) {
                this.sendFilesList(req, res, filePath , pathname);
            } else {
                // 显示文件
                console.log(filePath)
                this.sendFile(req, res, filePath, statObj);
            }
        } catch (error) {
            this.sendError(error);
        }
    }

    sendFilesList(req, res, filePath, pathname) {
        // 使用handlebars为模板，显示文件夹目录
        const temp = fs.readFileSync(path.resolve(__dirname, 'temp', 'list.html'), 'utf8');
        fs.readdir(filePath, function (err, files) {
            if (err) {
               return this.sendError(res, err);
            }
            if (files && files.length) {
                const fileList = files.map((item) => {
                    return { fileName: item, filePath: path.join(pathname, item) };
                })
                const html = handlebars.compile(temp)({ fileList });
                res.write(html);
                res.end();
            }
        })
    }

    sendFile(req, res, filePath, statObj) {
        res.setHeader('Content-type', `${mime.getType(filePath)};charest=utf-8`);
        if(this.hanleCache(req, res, statObj)) return;
        const fileZlieType = this.getFileAcceptEncoding(req, res);
        if (fileZlieType) {
            fs.createReadStream(filePath).pipe(fileZlieType).pipe(res);
        } else {
            fs.createReadStream(filePath).pipe(res);
        }
    }

    getFileAcceptEncoding(req, res) {
        // 设置压缩
        const acceptEncoding = req.headers['accept-encoding'];
        if (/\bgzip\b/.test(acceptEncoding)) {
            res.setHeader('Content-Encoding', 'gzip');
            return zlib.createGzip();
        } else if(/\bdeflate\b/.test(acceptEncoding)) {
            res.setHeader('Content-Encoding', 'deflate');
            return zlib.createDeflate();
        }
    }

    sendError(res, error) {
        res.statusCode = 500;
        debug(inspect(error));
        res.write(error.toString());
        res.end();
    }

    hanleCache(req, res, statObj) {
        const ifNoneMatch = req.headers['if-none-match'];
        const ifModifiedSince = req.headers['if-modified-since'];
        const size = statObj.size;
        const ctime = statObj.ctime.toGMTString();
        // 设置强缓存
        res.setHeader('Expries', new Date(Date.now() + 3 * 1000).toGMTString());
        res.setHeader('Cache-control', 'private,max-age=3');
        // 设置对比缓存
        res.setHeader('ETag', size);
        res.setHeader('Last-Modified', ctime);
        // 对比缓存：对比文件大小
        // 对比缓存：对比文件修改时间
        if (ifNoneMatch === size || ifModifiedSince === ctime) {
            res.statusCode = 304;
            res.end();
            return true;
        }
    }
}

const server = new Server();
server.start();
module.exports = Server;