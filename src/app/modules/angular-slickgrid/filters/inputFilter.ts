import {
  Column,
  ColumnFilter,
  Filter,
  FilterArguments,
  FilterCallback,
  GridOption,
  OperatorType,
  OperatorString,
  SearchTerm,
} from './../models/index';

// using external non-typed js libraries
declare const $: any;

export class InputFilter implements Filter {
  protected _clearFilterTriggered = false;
  protected _debounceTypingDelay = 0;
  protected _shouldTriggerQuery = true;
  protected _inputType = 'text';
  protected _timer?: any;
  protected $filterElm: any;
  grid: any;
  searchTerms: SearchTerm[] = [];
  columnDef!: Column;
  callback!: FilterCallback;

  constructor() { }

  /** Getter for the Column Filter */
  get columnFilter(): ColumnFilter {
    return this.columnDef && this.columnDef.filter || {};
  }

  /** Getter to know what would be the default operator when none is specified */
  get defaultOperator(): OperatorType | OperatorString {
    return OperatorType.empty;
  }

  /** Getter of input type (text, number, password) */
  get inputType() {
    return this._inputType;
  }

  /** Setter of input type (text, number, password) */
  set inputType(type: string) {
    this._inputType = type;
  }

  /** Getter of the Operator to use when doing the filter comparing */
  get operator(): OperatorType | OperatorString {
    return this.columnFilter && this.columnFilter.operator || this.defaultOperator;
  }

  /** Setter for the filter operator */
  set operator(operator: OperatorType | OperatorString) {
    if (this.columnFilter) {
      this.columnFilter.operator = operator;
    }
  }

  /** Getter for the Grid Options pulled through the Grid Object */
  protected get gridOptions(): GridOption {
    return (this.grid && this.grid.getOptions) ? this.grid.getOptions() : {};
  }

  /**
   * Initialize the Filter
   */
  init(args: FilterArguments) {
    if (!args) {
      throw new Error('[Angular-SlickGrid] A filter must always have an "init()" with valid arguments.');
    }
    this.grid = args.grid;
    this.callback = args.callback;
    this.columnDef = args.columnDef;
    this.searchTerms = (args.hasOwnProperty('searchTerms') ? args.searchTerms : []) || [];

    // analyze if we have any keyboard debounce delay (do we wait for user to finish typing before querying)
    // it is used by default for a backend service but is optional when using local dataset
    const backendApi = this.gridOptions?.backendServiceApi;
    this._debounceTypingDelay = (backendApi ? (backendApi?.filterTypingDebounce ?? this.gridOptions?.defaultBackendServiceFilterTypingDebounce) : this.gridOptions?.filterTypingDebounce) ?? 0;

    // filter input can only have 1 search term, so we will use the 1st array index if it exist
    const searchTerm = (Array.isArray(this.searchTerms) && this.searchTerms.length >= 0) ? this.searchTerms[0] : '';

    // step 1, create HTML string template
    const filterTemplate = this.buildTemplateHtmlString();

    // step 2, create the DOM Element of the filter & initialize it if searchTerm is filled
    this.$filterElm = this.createDomElement(filterTemplate, searchTerm);

    // step 3, subscribe to the input change event and run the callback when that happens
    // also add/remove "filled" class for styling purposes
    // we'll use all necessary events to cover the following (keyup, change, mousewheel & spinner)
    this.$filterElm.on('keyup blur change wheel', this.handleInputChange.bind(this));
  }

  /**
   * Clear the filter value
   */
  clear(shouldTriggerQuery = true) {
    if (this.$filterElm) {
      this._clearFilterTriggered = true;
      this._shouldTriggerQuery = shouldTriggerQuery;
      this.searchTerms = [];
      this.$filterElm.val('');
      this.$filterElm.trigger('change');
    }
  }

  /**
   * destroy the filter
   */
  destroy() {
    if (this.$filterElm) {
      this.$filterElm.off('keyup blur change wheel').remove();
    }
    this.$filterElm = null;
  }

  getValue() {
    return this.$filterElm.val();
  }

  /** Set value(s) on the DOM element */
  setValues(values: SearchTerm | SearchTerm[], operator?: OperatorType | OperatorString) {
    const searchValues = Array.isArray(values) ? values : [values];
    let searchValue: SearchTerm = '';
    for (const value of searchValues) {
      searchValue = operator ? this.addOptionalOperatorIntoSearchString(value, operator) : value;
      this.$filterElm.val(searchValue);
    }

    // set the operator when defined
    this.operator = operator || this.defaultOperator;
  }

  //
  // protected functions
  // ------------------

  /**
 * When loading the search string from the outside into the input text field, we should also add the prefix/suffix of the operator.
 * We do this so that if it was loaded by a Grid Presets then we should also add the operator into the search string
 * Let's take these 3 examples:
 * 1. (operator: '>=', searchTerms:[55]) should display as ">=55"
 * 2. (operator: 'StartsWith', searchTerms:['John']) should display as "John*"
 * 3. (operator: 'EndsWith', searchTerms:['John']) should display as "*John"
 * @param operator - operator string
 */
  protected addOptionalOperatorIntoSearchString(inputValue: SearchTerm, operator: OperatorType | OperatorString): string {
    let searchTermPrefix = '';
    let searchTermSuffix = '';
    let outputValue = inputValue === undefined || inputValue === null ? '' : `${inputValue}`;

    if (operator && outputValue) {
      switch (operator) {
        case '<>':
        case '!=':
        case '=':
        case '==':
        case '>':
        case '>=':
        case '<':
        case '<=':
          searchTermPrefix = operator;
          break;
        case 'EndsWith':
        case '*z':
          searchTermPrefix = '*';
          break;
        case 'StartsWith':
        case 'a*':
          searchTermSuffix = '*';
          break;
      }
      outputValue = `${searchTermPrefix}${outputValue}${searchTermSuffix}`;
    }

    return outputValue;
  }

  /**
   * Create the HTML template as a string
   */
  protected buildTemplateHtmlString() {
    const fieldId = this.columnDef && this.columnDef.id;
    let placeholder = (this.gridOptions) ? (this.gridOptions.defaultFilterPlaceholder || '') : '';
    if (this.columnFilter && this.columnFilter.placeholder) {
      placeholder = this.columnFilter.placeholder;
    }
    return `<input type="${this._inputType || 'text'}" role="presentation" autocomplete="off" class="form-control search-filter filter-${fieldId}" placeholder="${placeholder}"><span></span>`;
  }

  /**
   * From the html template string, create a DOM element
   * @param filterTemplate
   */
  protected createDomElement(filterTemplate: string, searchTerm?: SearchTerm) {
    const fieldId = this.columnDef && this.columnDef.id;
    const $headerElm = this.grid.getHeaderRowColumn(fieldId);
    $($headerElm).empty();

    // create the DOM element & add an ID and filter class
    const $filterElm = $(filterTemplate);

    $filterElm.val(searchTerm);
    $filterElm.data('columnId', fieldId);

    // if there's a search term, we will add the "filled" class for styling purposes
    if (searchTerm) {
      $filterElm.addClass('filled');
    }

    // append the new DOM element to the header row
    if ($filterElm && typeof $filterElm.appendTo === 'function') {
      $filterElm.appendTo($headerElm);
    }

    return $filterElm;
  }

  /**
   * Event handler to cover the following (keyup, change, mousewheel & spinner)
   * We will trigger the Filter Service callback from this handler
   */
  protected handleInputChange(event: KeyboardEvent & { target: any; }) {
    if (this._clearFilterTriggered) {
      this.callback(event, { columnDef: this.columnDef, clearFilterTriggered: this._clearFilterTriggered, shouldTriggerQuery: this._shouldTriggerQuery });
      this.$filterElm.removeClass('filled');
    } else {
      const eventType = event?.type ?? '';
      let value = event?.target?.value ?? '';
      const enableWhiteSpaceTrim = this.gridOptions.enableFilterTrimWhiteSpace || this.columnFilter.enableTrimWhiteSpace;
      if (typeof value === 'string' && enableWhiteSpaceTrim) {
        value = value.trim();
      }
      value === '' ? this.$filterElm.removeClass('filled') : this.$filterElm.addClass('filled');
      const callbackArgs = { columnDef: this.columnDef, operator: this.operator, searchTerms: [value], shouldTriggerQuery: this._shouldTriggerQuery };
      const typingDelay = (eventType === 'keyup' && event?.key !== 'Enter') ? this._debounceTypingDelay : 0;

      if (typingDelay > 0) {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.callback(event, callbackArgs), typingDelay);
      } else {
        this.callback(event, callbackArgs);
      }
    }

    // reset both flags for next use
    this._clearFilterTriggered = false;
    this._shouldTriggerQuery = true;
  }
}
