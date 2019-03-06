import styled from "@emotion/styled";
import { Color, WidthProperty } from "csstype";
import domToImage from "dom-to-image";
import { saveAs } from "file-saver";
import createHistory from "history/createBrowserHistory";
import fromPairs from "lodash/fromPairs";
import map from "lodash/map";
import set from "lodash/set";
import queryString from "query-string";
import * as React from "react";
import { Theme } from "../../schema/Theme";
import * as components from "../components";
import connect from "../components/connect";
import Select from "../components/Select";
import { themesQuery } from "../queries";
import * as templates from "../templates";

interface AssetDesignerContainerProps {
  width: WidthProperty<string>;
}

const AssetDesignerContainer = styled.article`
  display: grid;
  grid-template-columns: ${({ width }) => width} 1fr;
` as React.FC<AssetDesignerContainerProps>;

interface SidebarProps {
  backgroundColor: Color;
}

const Sidebar = styled.aside`
  padding: 1em;
  vertical-align: top;
  height: 100vh;
  position: sticky;
  background-color: ${({ backgroundColor }) => backgroundColor};

  @media print {
    display: none;
  }
` as React.FC<SidebarProps>;
const SidebarHeader = styled.h2``;
const SidebarItem = styled.div`
  margin-bottom: 1em;
`;

const Main = styled.main`
  overflow: auto;
  margin: auto;
  align-self: center;
`;

const ExportButton = styled.button``;

const VariableContainer = styled.div``;

// TODO: Share the type from the backend
interface DesignerState {
  themeId: Theme["id"];
  selectionId: string; // One of templates
  variables: { [key: string]: any };
}

enum ActionTypes {
  UPDATE_SELECTION_ID,
  UPDATE_THEME_ID,
  UPDATE_VARIABLE,
}

function assetDesignerReducer(state: DesignerState, action) {
  const { field, value } = action;

  switch (action.type) {
    case ActionTypes.UPDATE_SELECTION_ID:
      updateQuery("selectionId", value);

      return { ...state, selectionId: value };
    case ActionTypes.UPDATE_THEME_ID:
      updateQuery("themeId", value);

      return { ...state, themeId: value };
    case ActionTypes.UPDATE_VARIABLE:
      const newVariables = { ...state.variables };

      // Needed to support nested access (mutates!)
      set(newVariables, field, value);

      updateQuery("variables", JSON.stringify(newVariables));

      return { ...state, variables: newVariables };
    default:
      throw new Error("No matching reducer found!");
  }
}

function updateQuery(field: string, value: any) {
  const history = createHistory();
  const query = queryString.stringify({
    ...queryString.parse(location.search),
    [field]: value,
  });
  history.push(`?${query}`);
}

interface AssetDesignerPageProps {
  initialState: {
    selectionId: DesignerState["selectionId"];
  };
  themes: Theme[];
}

function AssetDesignerPage({
  initialState = {
    selectionId: "",
  },
  themes,
}: AssetDesignerPageProps) {
  if (!themes) {
    return null;
  }

  const [state, dispatch] = React.useReducer(
    assetDesignerReducer,
    initialState,
    ({ selectionId }) => {
      const selection = getSelection(selectionId);

      return {
        selectionId,
        themeId: "",
        variables: fromPairs(
          selection.variables.map(({ id, validation }) => {
            return [id, validation.default];
          })
        ),
      };
    }
  );
  const theme = themes.find(({ id }) => id === state.themeId) || themes[0];
  const { selectionId } = state;

  const selection = getSelection(selectionId) || NoSelectionFound;
  const variables = selection.variables
    ? selection.variables.map(variable => ({
        ...variable,
        value: state.variables[variable.id],
      }))
    : []; // TODO: Overlay to selection
  const sideBarWidth = "18em";
  const assetDesignTemplateId = "asset-design-template-id";

  return (
    <AssetDesignerContainer width={sideBarWidth}>
      <Sidebar backgroundColor={theme ? theme.colors.background : ""}>
        <SidebarHeader>Asset designer</SidebarHeader>

        <SidebarItem>
          <ExportButton
            onClick={() => {
              const domNode = document.getElementById(assetDesignTemplateId);

              if (domNode) {
                domToImage
                  .toBlob(domNode)
                  .then(blob => {
                    // TODO: Improve this further (i.e. name of the speaker for tweets etc.)
                    saveAs(blob, `${selection.filename}.png`);
                  })
                  .catch(err => console.error(err));
              }
            }}
          >
            Export Image
          </ExportButton>
        </SidebarItem>

        <SidebarItem>
          <SidebarHeader>Themes</SidebarHeader>
          <ThemeSelector
            themes={themes}
            selectedTheme={state.themeId}
            onChange={(field, value) =>
              dispatch({ type: ActionTypes.UPDATE_THEME_ID, field, value })
            }
          />
        </SidebarItem>

        <SidebarItem>
          <SidebarHeader>Templates</SidebarHeader>
          <ComponentSelector
            templates={Object.keys(templates)}
            selectedTemplate={selectionId}
            onChange={value =>
              dispatch({ type: ActionTypes.UPDATE_SELECTION_ID, value })
            }
          />
        </SidebarItem>

        <SidebarItem>
          <SidebarHeader>Components</SidebarHeader>
          <ComponentSelector
            templates={Object.keys(components)}
            selectedTemplate={selectionId}
            onChange={value =>
              dispatch({ type: ActionTypes.UPDATE_SELECTION_ID, value })
            }
          />
        </SidebarItem>

        {variables.length > 0 && (
          <SidebarItem>
            <SidebarHeader>Variables</SidebarHeader>

            {map(variables, variable => (
              <VariableContainer key={variable.id}>
                <VariableSelector
                  variables={state.variables}
                  field={variable.id}
                  selectedVariable={
                    variable.value || variable.validation.default
                  }
                  query={variable.query}
                  mapToCollection={variable.mapToCollection}
                  mapToOption={variable.mapToOption}
                  validation={variable.validation}
                  onChange={(field, value) =>
                    dispatch({
                      type: ActionTypes.UPDATE_VARIABLE,
                      field,
                      value,
                    })
                  }
                />
              </VariableContainer>
            ))}
          </SidebarItem>
        )}
      </Sidebar>
      <Main>
        {React.createElement(selection, {
          ...state.variables,
          theme,
          id: assetDesignTemplateId,
        })}
      </Main>
    </AssetDesignerContainer>
  );
}

function getSelection(selectionId) {
  return templates[selectionId] || components[selectionId];
}

function NoSelectionFound() {
  return <>No selection found!</>;
}

interface ThemeSelectorProps {
  themes: Theme[];
  selectedTheme: Theme["id"];
  onChange: (field: string, value: string) => void;
}

function ThemeSelector({
  themes,
  selectedTheme,
  onChange,
}: ThemeSelectorProps) {
  return (
    <Select
      options={
        themes
          ? themes.map(theme => ({
              value: theme.id,
              label: theme.id,
            }))
          : []
      }
      selected={selectedTheme}
      onChange={({ target: { value } }) => {
        onChange("conferenceSeriesId", value);
      }}
    />
  );
}

interface ComponentSelectorProps {
  templates: string[];
  selectedTemplate: string;
  onChange: (value: string) => void;
}

const ComponentSelectorContainer = styled.div``;
const ComponentSelectorSelectedOption = styled.div``;
const ComponentSelectorOption = styled.a`
  display: block;
`;

function ComponentSelector({
  templates,
  selectedTemplate,
  onChange,
}: ComponentSelectorProps) {
  return (
    <ComponentSelectorContainer>
      {templates.map(templateId =>
        templateId === selectedTemplate ? (
          <ComponentSelectorSelectedOption key={templateId}>
            {templateId}
          </ComponentSelectorSelectedOption>
        ) : (
          <ComponentSelectorOption
            key={templateId}
            href="#"
            onClick={e => {
              e.preventDefault();

              onChange(templateId);
            }}
          >
            {templateId}
          </ComponentSelectorOption>
        )
      )}
    </ComponentSelectorContainer>
  );
}

interface VariableSelector {
  variables: DesignerState["variables"];
  field: string;
  options: string[];
  selectedVariable: string;
  query: string;
  // TODO: Use the same type as in connect
  mapToCollection: (result: any) => any;
  mapToOption: (result: any) => { value: any; label: any };
  validation: { type: any; default: string };
  onChange: (field: string, value: string) => void;
}

// TODO: This should handle labels as well
function VariableSelector({
  field,
  selectedVariable,
  query,
  mapToCollection,
  mapToOption,
  validation,
  onChange,
  variables,
}) {
  if (!query) {
    return (
      <VariableFields
        field={field}
        validation={validation}
        selectedVariable={selectedVariable}
        onChange={onChange}
      />
    );
  }

  const ConnectedSelect = connect(
    "/graphql",
    query,
    variables
  )(result => {
    const collection = mapToCollection(result);

    return (
      <SelectorContainer>
        <SelectorLabel>{field}</SelectorLabel>
        <Select
          width="100%"
          options={
            collection
              ? [{ value: "", label: "" }].concat(collection.map(mapToOption))
              : []
          }
          selected={selectedVariable}
          onChange={({ target: { value } }) => {
            onChange(field, value);
          }}
        />
      </SelectorContainer>
    );
  });

  return <ConnectedSelect />;
}

const SelectorLabel = styled.label`
  margin-right: 1em;
`;
const SelectorInput = styled.input`
  width: 100%;
`;
const SelectorTextArea = styled.textarea`
  width: 100%;
`;
const SelectorContainer = styled.div`
  display: grid;
  grid-template-columns: 0.75fr 1.25fr;
`;

function VariableFields({ validation, selectedVariable, onChange, field }) {
  if (validation.type === String) {
    // TODO: Use an enum here instead
    if (validation.modifier === "long") {
      return (
        <SelectorContainer>
          <SelectorLabel>{field}</SelectorLabel>
          <SelectorTextArea
            defaultValue={selectedVariable}
            onChange={({ target: { value } }) => {
              onChange(field, value);
            }}
            rows={8}
          />
        </SelectorContainer>
      );
    }

    return (
      <SelectorContainer>
        <SelectorLabel>{field}</SelectorLabel>
        <SelectorInput
          type="text"
          defaultValue={selectedVariable}
          onChange={({ target: { value } }) => {
            onChange(field, value);
          }}
        />
      </SelectorContainer>
    );
  }
  if (validation.type === Number) {
    return (
      <SelectorContainer>
        <SelectorLabel>{field}</SelectorLabel>
        <SelectorInput
          type="number"
          defaultValue={selectedVariable}
          onChange={({ target: { value } }) => {
            onChange(field, value);
          }}
        />
      </SelectorContainer>
    );
  }
  if (validation.type === Boolean) {
    return (
      <SelectorContainer>
        <SelectorLabel>{field}</SelectorLabel>
        <SelectorInput
          type="checkbox"
          checked={selectedVariable}
          onChange={({ target: { checked } }) => {
            onChange(field, checked);
          }}
        />
      </SelectorContainer>
    );
  }
  if (validation.type === "enum") {
    const values = validation.values;

    return (
      <SelectorContainer>
        <SelectorLabel>{field}</SelectorLabel>
        <Select
          width="100%"
          options={
            values
              ? [{ value: "", label: "" }].concat(
                  map(values, (label, value) => ({
                    value,
                    label,
                  }))
                )
              : []
          }
          selected={selectedVariable}
          onChange={({ target: { value } }) => {
            onChange(field, value);
          }}
        />
      </SelectorContainer>
    );
  }

  const fields = validation.type._fields;

  if (fields) {
    const validationDefaults = validation.default;

    return (
      <>
        {map(fields, ({ type, values }, id) => (
          <VariableFields
            key={id}
            validation={{
              id,
              type,
              values,
            }}
            selectedVariable={validationDefaults[id] || selectedVariable}
            onChange={onChange}
            field={`${field}.${id}`}
          />
        ))}
      </>
    );
  }

  console.error(`Type ${validation.type} hasn't been implemented yet`);
  return null;
}

const ConnectedAssetDesignerPage = connect(
  "/graphql",
  themesQuery
)(AssetDesignerPage);

export default ConnectedAssetDesignerPage;
