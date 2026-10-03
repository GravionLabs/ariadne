import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramStore } from '../model/diagram-store';
import { EditorStore } from './editor-store';

describe('EditorStore', () => {
  let diagram: InstanceType<typeof DiagramStore>;
  let editor: EditorStore;
  let startId: string;
  let stateId: string;
  let edgeId: string;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EditorStore] });
    diagram = TestBed.inject(DiagramStore);
    editor = TestBed.inject(EditorStore);
    startId = diagram.addNode('start');
    stateId = diagram.appendNode(startId, 'state')!;
    edgeId = diagram.edges()[0].id;
  });

  it('starts without a selection', () => {
    expect(editor.hasSelection()).toBe(false);
    expect(editor.selectedNode()).toBeUndefined();
    expect(editor.selectedEdge()).toBeUndefined();
    expect(editor.inspectorOpen()).toBe(false);
  });

  it('derives the selected node only for a single node', () => {
    editor.setSelection([stateId], []);
    expect(editor.selectedNode()?.id).toBe(stateId);
    expect(editor.hasSelection()).toBe(true);
    expect(editor.inspectorOpen()).toBe(true);

    editor.setSelection([stateId, startId], []);
    expect(editor.selectedNode()).toBeUndefined();
    expect(editor.hasSelection()).toBe(true);
    expect(editor.inspectorOpen()).toBe(false);

    editor.setSelection([stateId], [edgeId]);
    expect(editor.selectedNode()).toBeUndefined();
    expect(editor.selectedEdge()).toBeUndefined();
  });

  it('derives the selected edge only for a single edge', () => {
    editor.selectEdge(edgeId);
    expect(editor.selectedEdge()?.id).toBe(edgeId);
    expect(editor.selectedNode()).toBeUndefined();
    expect(editor.inspectorOpen()).toBe(true);
  });

  it('follows edits of the selected node', () => {
    editor.setSelection([stateId], []);
    diagram.updateNode(stateId, { name: 'Renamed' });
    expect(editor.selectedNode()?.name).toBe('Renamed');
  });

  it('drops the derived selection when the node is removed', () => {
    editor.setSelection([stateId], []);
    diagram.remove({ nodeIds: [stateId] });
    expect(editor.selectedNode()).toBeUndefined();
  });

  it('exposes the selection for removal', () => {
    editor.setSelection([stateId], [edgeId]);
    expect(editor.selection()).toEqual({ nodeIds: [stateId], edgeIds: [edgeId] });
  });

  it('clears the selection', () => {
    editor.setSelection([stateId], []);
    editor.clearSelection();
    expect(editor.hasSelection()).toBe(false);
  });

  it('selects a node and remembers it for the next layout', () => {
    editor.selectNode(stateId);
    expect(editor.selectedNode()?.id).toBe(stateId);
    expect(editor.takePending()).toEqual({ fit: false, select: stateId });
  });

  it('hands out pending work once', () => {
    editor.requestFit();
    expect(editor.takePending()).toEqual({ fit: true, select: null });
    expect(editor.takePending()).toEqual({ fit: false, select: null });
  });
});
