#!/usr/bin/env bun

import '@opentui/solid/preload';
import { loadSnapshot } from '@model-picker/catalog';
import type { ModelRecord } from '@model-picker/domain';
import {
  createModelBrowserState,
  toOpenRouterUrl,
} from '@model-picker/ui-core';
import { render, useKeyboard } from '@opentui/solid';
import { For, Show, createMemo, createSignal } from 'solid-js';

const snapshot = await loadSnapshot();

function formatPrice(model: ModelRecord): string {
  return `$${model.pricing.outputPerMillion.toFixed(2)}/M`;
}

function formatSpeed(model: ModelRecord): string {
  if (!model.speed.bestThroughput) {
    return 'N/A';
  }

  return `${model.speed.bestThroughput.toFixed(0)} tok/s`;
}

function formatContext(model: ModelRecord): string {
  if (model.contextLength >= 1_000_000) {
    return `${(model.contextLength / 1_000_000).toFixed(1)}M`;
  }

  return `${Math.round(model.contextLength / 1_000)}K`;
}

function openUrl(url: string): boolean {
  try {
    const command =
      process.platform === 'darwin'
        ? ['open', url]
        : process.platform === 'win32'
          ? ['cmd', '/c', 'start', '', url]
          : ['xdg-open', url];

    const processHandle = Bun.spawn(command, {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    processHandle.unref();
    return true;
  } catch {
    return false;
  }
}

function App(props: { models: ModelRecord[] }) {
  const browser = createModelBrowserState(props.models, {
    maxCompareItems: 6,
  });
  const [status, setStatus] = createSignal<string>('Ready.');

  const compareHint = createMemo(() => {
    const active = browser.activeCompareModel();
    if (!active) {
      return 'Compare queue is empty. Press c to add the selected model.';
    }

    return `Active compare target: ${active.id}. Press Enter to jump.`;
  });

  useKeyboard((event) => {
    if (event.eventType === 'release') {
      return;
    }

    if ((event.name === 'c' && event.ctrl) || event.name === 'q') {
      process.exit(0);
      return;
    }

    const models = browser.visibleModels();
    if (models.length === 0) {
      return;
    }

    switch (event.name) {
      case 'down':
      case 'j':
        browser.moveSelection(1);
        return;
      case 'up':
      case 'k':
        browser.moveSelection(-1);
        return;
      case 'g':
        if (event.shift) {
          browser.selectLast();
        } else {
          browser.selectFirst();
        }
        return;
      case 's':
        browser.cycleSort(1);
        setStatus(`Sort updated: ${browser.sortBy()}`);
        return;
      case 'f':
        browser.cycleQuickFilter(1);
        setStatus(`Quick filter: ${browser.quickFilter()}`);
        return;
      case 'c': {
        const target = browser.selectedModel();
        if (target) {
          browser.toggleCompare(target.id);
          setStatus(`Toggled compare model: ${target.id}`);
        }
        return;
      }
      case '[':
        browser.cycleCompare(-1);
        setStatus(compareHint());
        return;
      case ']':
        browser.cycleCompare(1);
        setStatus(compareHint());
        return;
      case 'enter':
      case 'return': {
        const jumped = browser.jumpToActiveCompare();
        setStatus(
          jumped
            ? `Jumped to compare target: ${browser.selectedModel()?.id}`
            : 'No compare target selected.',
        );
        return;
      }
      case 'o': {
        const model = browser.selectedModel();
        if (!model) {
          return;
        }

        const opened = openUrl(toOpenRouterUrl(model.id));
        setStatus(
          opened
            ? `Opened ${model.id} in browser.`
            : `Failed to open browser for ${model.id}.`,
        );
        return;
      }
      default:
        return;
    }
  });

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1}>
      <box border borderStyle="rounded" borderColor="cyan" padding={1}>
        <text>
          <strong>Model Picker TUI</strong>  j/k or ↑/↓ navigate · s sort · f quick filter · c compare · [ ] cycle compare · enter jump · o open page · g/G top/bottom · q quit
        </text>
      </box>

      <box border borderStyle="single" borderColor="gray" padding={1}>
        <text>
          Sort: <strong>{browser.sortBy()}</strong> · Filter: <strong>{browser.quickFilter()}</strong> · Models: <strong>{browser.visibleModels().length}</strong> · Compared: <strong>{browser.compareIds().length}</strong>
        </text>
      </box>

      <box border borderStyle="single" borderColor="blue" padding={1}>
        <text>{status()}</text>
      </box>

      <box width="100%" flexGrow={1} flexDirection="row" gap={1}>
        <box
          width="45%"
          height="100%"
          border
          borderStyle="rounded"
          borderColor="magenta"
          padding={1}
          flexDirection="column"
          title="Model List"
        >
          <scrollbox flexGrow={1} scrollY>
            <For each={browser.visibleModels()}>
              {(model: ModelRecord, index) => (
                <text bg={index() === browser.selectedIndex() ? 'cyan' : undefined} fg={index() === browser.selectedIndex() ? 'black' : 'white'}>
                  {index() === browser.selectedIndex() ? '▶' : ' '} {model.name} ({formatSpeed(model)} · {formatPrice(model)})
                </text>
              )}
            </For>
            <Show when={browser.visibleModels().length === 0}>
              <text fg="yellow">No models for current filter.</text>
            </Show>
          </scrollbox>
        </box>

        <box width="55%" height="100%" flexDirection="column" gap={1}>
          <box
            border
            borderStyle="rounded"
            borderColor="green"
            padding={1}
            height="70%"
            title="Model Detail"
          >
            <Show
              when={browser.selectedModel()}
              fallback={<text fg="yellow">No model selected.</text>}
            >
              {(model: () => ModelRecord) => (
                <scrollbox scrollY>
                  <text>
                    <strong>{model().name}</strong>
                  </text>
                  <text>ID: {model().id}</text>
                  <text>Speed: {formatSpeed(model())}</text>
                  <text>Output Price: {formatPrice(model())}</text>
                  <text>Context: {formatContext(model())}</text>
                  <text>
                    Ranks: speed #{model().rank.bySpeed} · price #{model().rank.byPrice} · context #{model().rank.byContext}
                  </text>
                  <text>Modality: {model().architecture.modality}</text>
                  <text>
                    Input: {model().architecture.inputModalities.join(', ') || 'N/A'}
                  </text>
                  <text>
                    Output: {model().architecture.outputModalities.join(', ') || 'N/A'}
                  </text>
                  <text>Moderated: {model().topProvider.isModerated ? 'Yes' : 'No'}</text>
                  <text>URL: {toOpenRouterUrl(model().id)}</text>
                  <text>{model().description}</text>
                </scrollbox>
              )}
            </Show>
          </box>

          <box
            border
            borderStyle="rounded"
            borderColor="yellow"
            padding={1}
            height="30%"
            title="Compare Queue"
          >
            <Show
              when={browser.comparedModels().length > 0}
              fallback={<text fg="yellow">Press `c` to add selected model to compare queue.</text>}
            >
              <box flexDirection="column" gap={1} width="100%" height="100%">
                <text fg="gray">{compareHint()}</text>
                <scrollbox scrollY>
                  <For each={browser.comparedModels()}>
                    {(model: ModelRecord, index) => (
                      <text
                        bg={
                          index() === browser.activeCompareIndex()
                            ? 'yellow'
                            : undefined
                        }
                        fg={
                          index() === browser.activeCompareIndex()
                            ? 'black'
                            : 'white'
                        }
                      >
                        {index() === browser.activeCompareIndex() ? '◆' : ' '} {model.id}
                      </text>
                    )}
                  </For>
                </scrollbox>
              </box>
            </Show>
          </box>
        </box>
      </box>
    </box>
  );
}

await render(() => <App models={snapshot.models} />);
