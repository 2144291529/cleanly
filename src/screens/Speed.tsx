import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { StartupItem } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Empty, ScreenHead, Toggle } from '../components/ui';
import { useFileIcons } from '../lib/useFileIcons';
import { useStore } from '../state';
import './system.css';

const GROUPS: { impact: StartupItem['impact']; title: string; hint: string }[] = [
  { impact: 'high', title: '高影响', hint: '对开机速度影响最大' },
  { impact: 'medium', title: '中影响', hint: '有一定影响，但较轻' },
  { impact: 'low', title: '低影响', hint: '登录时几乎无感' },
];

const ABSOLUTE = /^(?:[a-z]:[\\/]|\\\\|\/)/i;
const APP_PATH = /^(.+?\.(?:exe|app))(?=$|[\s"/\\,])/i;

/** The program a startup command launches: first quoted or unquoted token ending in .exe or .app. */
function programPath(command: string): string | undefined {
  const s = command.trim();
  if (!s) return undefined;
  const quoted = s.match(/^"([^"]+)"/);
  const m = (quoted ? quoted[1] : s).match(APP_PATH);
  const p = m?.[1].trim();
  return p && ABSOLUTE.test(p) ? p : undefined;
}

export default function Speed() {
  const { toast, system } = useStore();
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setItems(await api.startupItems());
    } catch (e) {
      setFailed(true);
      toast(e instanceof Error ? e.message : '无法读取开机启动应用', 'err');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (item: StartupItem, enabled: boolean) => {
    if (pending) return;
    setPending(item.id);
    try {
      setItems(await api.setStartupItem(item.id, enabled));
      toast(`${enabled ? '已启用' : '已禁用'} ${item.name}——下次启动时生效`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `无法更改 ${item.name}`, 'err');
    } finally {
      setPending(null);
    }
  };

  const list = useMemo(() => items ?? [], [items]);
  const programs = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    // %windir%\… style commands go as-is; the main process expands and validates them
    for (const i of list) out[i.id] = programPath(i.command) ?? (/^"?%\w+%[\\/]/.test(i.command.trim()) ? i.command.trim() : undefined);
    return out;
  }, [list]);
  const icons = useFileIcons(Object.values(programs));

  const enabled = list.filter((i) => i.enabled);
  const share = list.length ? enabled.length / list.length : 0;
  const heavyOn = enabled.filter((i) => i.impact === 'high').length;
  const locked = list.filter((i) => !i.canToggle).length;
  const admin = list.filter((i) => i.canToggle && i.needsAdmin).length;
  const off = list.length - enabled.length;
  const askHint = system?.platform === 'darwin' ? 'macOS 会要求您输入密码' : 'Windows 会请求权限';

  return (
    <div className="screen sy-screen">
      <ScreenHead title="开机加速" sub="选择随电脑启动的应用。登录时启动的项目越少，开机越快、越清爽。">
        <button type="button" className="btn small" onClick={() => void load()} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="history" />}
          刷新
        </button>
      </ScreenHead>

      {loading && !items ? (
        <div className="card-w sy-center">
          <span className="spinner" />
          正在查看随电脑启动的应用
        </div>
      ) : failed && !items ? (
        <div className="card-w">
          <Empty icon="warning" title="无法读取开机启动应用" text="检查过程受到阻碍，请稍后重试。">
            <button type="button" className="btn" onClick={() => void load()}>
              重试
            </button>
          </Empty>
        </div>
      ) : (
        <>
          <div className="sy-top sy-stagger">
            <article className={`lc c-speed${heavyOn ? '' : ' calm'}`}>
              <span className="glow" style={{ left: 20, top: 70, '--bd': '6s' } as CSSProperties} />
              <span className="glow" style={{ left: 200, top: -90, '--bd': '8s' } as CSSProperties} />
              <div className="lc-top">
                <span className="glass-ico">
                  <Icon name="gauge" />
                </span>
                <b>开机启动项</b>
              </div>
              <div className="lc-num">
                <strong>{enabled.length}</strong>
                <em>/ {list.length} 项已启用</em>
              </div>
              <div className="lc-sub">
                {enabled.length === 1 ? '启动 1 个应用' : `启动 ${enabled.length} 个应用`}（电脑开机时）
              </div>
              <div className="lc-foot">
                <div className="slider on sy-slider" role="img" aria-label={`已启用 ${Math.round(share * 100)}% 的开机启动项`}>
                  <span className="fill" style={{ width: `calc((100% - 10px) * ${Math.max(share, 0.04)})` }} />
                  <span className="knob" style={{ left: `calc((100% - 36px) * ${share} + 2px)` }} />
                </div>
              </div>
            </article>

            <section className="card-w panel">
              <div className="sy-sec-head">
                <h2>概览</h2>
              </div>
              <p className="sy-note" style={{ margin: 0 }}>
                关闭某个应用只会阻止它开机启动，不会卸载任何程序，您可以随时重新启用。
                {admin > 0 && '标记为“管理员”的项目是系统级设置，因此会先请求您的权限。'}
              </p>
              <div className="sy-stats">
                <div className={`sy-stat${heavyOn ? ' hot' : ''}`}>
                  <strong>{heavyOn}</strong>
                  <span>个高影响应用已启用</span>
                </div>
                <div className="sy-stat">
                  <strong>{off}</strong>
                  <span>个已关闭</span>
                </div>
                {locked > 0 || admin === 0 ? (
                  <div className="sy-stat">
                    <strong>{locked}</strong>
                    <span>个由系统锁定</span>
                  </div>
                ) : (
                  <div className="sy-stat">
                    <strong>{admin}</strong>
                    <span>个需要管理员权限</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {list.length === 0 ? (
            <div className="card-w">
              <Empty icon="power" title="没有随电脑启动的应用" text="您的开机启动项已经精简到最少了。" />
            </div>
          ) : (
            <div className="sy-stagger sy-groups">
              {GROUPS.map((g) => {
                const rows = list.filter((i) => i.impact === g.impact);
                if (!rows.length) return null;
                return (
                  <section key={g.impact} className="card-w panel">
                    <div className="sy-sec-head">
                      <h2>{g.title}</h2>
                      <span className={`tag ${g.impact}`}>{g.impact === 'high' ? '高' : g.impact === 'medium' ? '中' : '低'}</span>
                      <span className="grow" />
                      <span className="sy-count">
                        {rows.filter((r) => r.enabled).length} / {rows.length} 项已启用 · {g.hint}
                      </span>
                    </div>
                    <div className="list">
                      {rows.map((item) => {
                        const prog = programs[item.id];
                        const icon = prog ? icons[prog] : undefined;
                        const asks = item.canToggle && item.needsAdmin;
                        const busy = pending === item.id;
                        return (
                          <div key={item.id} className={`row${item.enabled ? '' : ' sy-off'}${busy ? ' sy-busy' : ''}`}>
                            {icon ? (
                              <span className={`sy-appico sy-imp-${item.impact}`} aria-hidden="true">
                                <img src={icon} alt="" draggable={false} decoding="async" />
                              </span>
                            ) : (
                              <span className={`chip-ico sy-chip-${item.impact}`}>
                                <Icon name="power" />
                              </span>
                            )}
                            <div className="grow">
                              <div className="sy-title-line">
                                <span className="title">{item.name}</span>
                                {asks && (
                                  <span className="sy-admin" title={askHint}>
                                    <Icon name="shield" />
                                    管理员
                                  </span>
                                )}
                              </div>
                              <div className="sub sy-cmd" title={item.command}>
                                {item.command || '未记录命令'}
                              </div>
                              {asks && <div className={`sub sy-ask${busy ? ' on' : ''}`}>{busy ? '正在等待您的权限…' : askHint}</div>}
                            </div>
                            <span className="sy-loc">{item.location}</span>
                            {item.canToggle ? (
                              busy ? (
                                <span className="sy-pending" role="status" aria-label={`正在更改 ${item.name}`}>
                                  <span className="spinner" />
                                </span>
                              ) : (
                                <span title={asks ? askHint : undefined} className="sy-switch">
                                  <Toggle
                                    checked={item.enabled}
                                    label={`开机启动 ${item.name}${asks ? `（${askHint.toLowerCase()}）` : ''}`}
                                    onChange={(v) => void toggle(item, v)}
                                  />
                                </span>
                              )
                            ) : (
                              <span className="sy-lock" title="此项目由系统或管理员策略控制，无法在此更改">
                                <Icon name="lock" />
                                由系统管理
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
