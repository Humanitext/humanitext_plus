declare module 'CETEIcean' {
  interface CETEIBehaviors {
    [namespace: string]: {
      [element: string]: (element: HTMLElement) => HTMLElement | void;
    };
  }

  interface CETEIDocument extends Document {
    getElementById(elementId: string): HTMLElement | null;
  }

  class CETEI {
    constructor();
    addBehaviors(behaviors: CETEIBehaviors): void;
    getHTML5(
      url: string, 
      callback: (document: CETEIDocument) => void,
      options?: any
    ): void;
  }

  export = CETEI;
}