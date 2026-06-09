// bot.js — チームプロテアラボ用スケジュール管理bot
// 必要パッケージ: npm install discord.js
import {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder
} from 'discord.js';
const TOKEN     = process.env.DISCORD_TOKEN;     // botトークン
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // アプリのClient ID
const GUILD_ID  = process.env.DISCORD_GUILD_ID;  // サーバーID
// --- 簡易データ保存（本番はDB推奨。ここではJSONファイル） ---
// ★Railwayの永続ストレージ(Volume)を使うため、保存先を環境変数で切替可能にしてあります。
//   ローカル実行時は ./data.json、Railwayでは DATA_FILE=/data/data.json を使います。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
const DB = process.env.DATA_FILE || './data.json';
function loadDB() { return existsSync(DB) ? JSON.parse(readFileSync(DB)) : { tasks: [], events: [] }; }
function saveDB(d) {
  mkdirSync(dirname(DB), { recursive: true }); // 保存先フォルダが無ければ作る
  writeFileSync(DB, JSON.stringify(d, null, 2));
}
// --- スラッシュコマンド定義 ---
const commands = [
  new SlashCommandBuilder().setName('task').setDescription('タスク管理')
    .addSubcommand(s => s.setName('add').setDescription('タスク追加')
      .addStringOption(o => o.setName('title').setDescription('内容').setRequired(true))
      .addStringOption(o => o.setName('project').setDescription('プロジェクト')
        .addChoices(
          { name: 'GLOW DIVE', value: 'GLOW DIVE' },
          { name: 'スイーツパニック', value: 'スイーツパニック' },
          { name: 'SweetsActionDX11', value: 'SweetsActionDX11' },
        )))
    .addSubcommand(s => s.setName('list').setDescription('タスク一覧'))
    .addSubcommand(s => s.setName('done').setDescription('完了')
      .addIntegerOption(o => o.setName('id').setDescription('タスクID').setRequired(true))),
  new SlashCommandBuilder().setName('event').setDescription('予定管理')
    .addSubcommand(s => s.setName('add').setDescription('予定追加')
      .addStringOption(o => o.setName('title').setDescription('予定名').setRequired(true))
      .addStringOption(o => o.setName('date').setDescription('YYYY-MM-DD').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('予定一覧')),
].map(c => c.toJSON());
const rest = new REST({ version: '10' }).setToken(TOKEN);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
console.log('コマンド登録完了');
// --- bot本体 ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  const db = loadDB();
  const sub = i.options.getSubcommand();
  if (i.commandName === 'task') {
    if (sub === 'add') {
      const t = { id: Date.now() % 100000, title: i.options.getString('title'),
                  project: i.options.getString('project') || 'その他', done: false };
      db.tasks.push(t); saveDB(db);
      await i.reply(`✅ タスク追加 #${t.id}「${t.title}」[${t.project}]`);
    } else if (sub === 'list') {
      const lines = db.tasks.map(t => `${t.done ? '☑' : '☐'} #${t.id} ${t.title} \`${t.project}\``);
      await i.reply(lines.length ? lines.join('\n') : 'タスクはありません');
    } else if (sub === 'done') {
      const id = i.options.getInteger('id');
      const t = db.tasks.find(x => x.id === id);
      if (t) { t.done = true; saveDB(db); await i.reply(`☑ #${id} を完了にしました`); }
      else await i.reply('そのIDは見つかりません');
    }
  }
  if (i.commandName === 'event') {
    if (sub === 'add') {
      db.events.push({ title: i.options.getString('title'), date: i.options.getString('date') });
      saveDB(db);
      await i.reply(`📅 予定追加「${i.options.getString('title')}」${i.options.getString('date')}`);
    } else if (sub === 'list') {
      const lines = db.events.sort((a,b)=>a.date.localeCompare(b.date))
        .map(e => `📅 ${e.date} — ${e.title}`);
      await i.reply(lines.length ? lines.join('\n') : '予定はありません');
    }
  }
});
// --- 毎朝9時のリマインダー（簡易版・1分ごとにチェック） ---
// ★時刻は環境変数 TZ=Asia/Tokyo を設定すれば日本時間になります（Railwayで設定）。
const REMIND_CHANNEL = process.env.REMIND_CHANNEL_ID;
setInterval(async () => {
  const now = new Date();
  if (now.getHours() !== 9 || now.getMinutes() !== 0) return;
  const db = loadDB();
  const today = now.toISOString().slice(0, 10);
  const due = db.events.filter(e => e.date === today);
  if (due.length && REMIND_CHANNEL) {
    const ch = await client.channels.fetch(REMIND_CHANNEL);
    const embed = new EmbedBuilder().setTitle('📅 今日の予定').setColor(0xD4537E)
      .setDescription(due.map(e => `・${e.title}`).join('\n'));
    ch.send({ embeds: [embed] });
  }
}, 60 * 1000);
client.once('ready', () => console.log(`ログイン: ${client.user.tag}`));
client.login(TOKEN);
