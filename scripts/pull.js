const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const FLATNOTES_URL = process.env.FLATNOTES_URL;
const FLATNOTES_API_URL = FLATNOTES_URL + '/api';
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'source', '_posts');

// 从环境变量中获取凭证
const USERNAME = process.env.FLATNOTES_USERNAME;
const PASSWORD = process.env.FLATNOTES_PASSWORD;

if (!USERNAME || !PASSWORD) {
    console.error('请设置 FLATNOTES_USERNAME 和 FLATNOTES_PASSWORD 环境变量');
    process.exit(1);
}

// 创建 axios 实例
const api = axios.create({
    baseURL: FLATNOTES_API_URL,
    timeout: 30000, // 30 秒超时
});

let Token = '';

async function getToken() {
    if (Token) {
        return Token;
    }

    const resp = await api.post('/token', {
        username: USERNAME,
        password: PASSWORD
    });

    Token = resp.data.access_token;

    return Token;
}

async function fetchNotes() {
    try {
        console.log('开始获取笔记列表...');
        const response = await api.get('/search?term=*&sort=lastModified&order=desc&limit=999', {
            headers: {
                Authorization: `Bearer ${await getToken()}`
            }
        });
        console.log(`获取到 ${response.data.length} 个笔记`);
        return response.data;
    } catch (error) {
        console.error('获取笔记列表时出错:', error.message);
        throw error;
    }
}

async function downloadNote(noteId) {
    try {
        console.log(`正在下载笔记: ${noteId}`);
        const response = await api.get(`/notes/${noteId}`, {
            headers: {
                Authorization: `Bearer ${await getToken()}`
            }
        });
        return response.data;
    } catch (error) {
        console.error(`下载笔记 ${noteId} 时出错:`, error.message);
        throw error;
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function extractAttachments(content) {
    const attachmentRegex = /!\[.*?\]\((.*?)\)/g;
    const attachments = [];
    let match;

    while ((match = attachmentRegex.exec(content)) !== null) {
        attachments.push(match[1]);
    }

    return attachments;
}

async function downloadAttachment(url, outputDir) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
        console.log(`跳过下载: ${url}`);
        return;
    }

    const fileName = path.basename(url);
    const filePath = path.join(outputDir, fileName);

    try {
        const response = await axios.get(FLATNOTES_URL + '/' + url, {
            responseType: 'arraybuffer',
            headers: {
                Authorization: `Bearer ${await getToken()}`
            }
        });
        await fs.writeFile(filePath, response.data);
        console.log(`附件下载成功: ${fileName}`);
    } catch (error) {
        console.error(`下载附件 ${fileName} 时出错:`, error.message);
    }
}

async function clearOutputDir() {
    try {
        await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        console.log('OUTPUT_DIR 已清空');
    } catch (error) {
        console.error('清空 OUTPUT_DIR 时出错:', error.message);
        throw error;
    }
}


async function main() {
    try {
        await clearOutputDir()
        const notes = await fetchNotes();

        for (const note of notes) {
            const noteInfo = await downloadNote(note.title);
            const fileName = `${note.title}.md`;
            const content = `\
---
title: ${noteInfo.title}
date: ${formatTimestamp(noteInfo.lastModified)}
---
${noteInfo.content}
            `;

            const attachments = extractAttachments(noteInfo.content);
            console.log(attachments)

            const attachmentsDir = path.join(__dirname, '../src/public/attachments');
            await fs.mkdir(attachmentsDir, { recursive: true });

            for (const attachment of attachments) {
                await downloadAttachment(attachment, attachmentsDir);
            }

            await fs.writeFile(path.join(OUTPUT_DIR, fileName), content);
        }

        console.log('所有笔记已成功下载。');
    } catch (error) {
        console.error('下载笔记时出错:', error.message);
    }
}

main();