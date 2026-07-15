# Software Architecture & Layout Design

This document describes the design system, frontend architecture, and dynamic rendering pipeline of the OpenStack Sizing, Compliance & Design Configurator.

---

## 1. Design System & Styling (CSS)

The user interface follows a modern **glassmorphic dark-theme** aesthetic designed using Vanilla CSS custom properties (variables) for theme alignment, responsive layouts, and interactions.

### A. Theme Variables
Theme colors, border radii, and background configurations are controlled globally in [style.css](file:///g:/My%20Drive/AntiGravity/Openstack/style.css):

```css
:root {
  --bg-primary: #0a0a0f;
  --bg-card: rgba(18, 18, 26, 0.65);
  --border-card: rgba(255, 255, 255, 0.08);
  --glass-blur: blur(12px);
  
  --primary-color: #ff3e3e;      /* Red Hat OpenStack theme red */
  --primary-hover: #ff5757;
  --text-primary: #f3f3f6;
  --text-secondary: #a0a0b0;
  
  --accent-emerald: #00fe9c;     /* Sizing compliance green */
  --accent-warning: #ffd000;     /* Warnings alert yellow */
}
```

### B. Responsive Structure
The application uses a hybrid **CSS Flexbox** and **CSS Grid** layout to support high-density sizing inputs alongside the logical topology dashboard. Under `1300px` viewports, the grid structure automatically collapses to stack elements vertically.

---

## 2. Stateful Frontend Pipeline (JS)

The application behaves as a reactive single-page app (SPA) driven by a central state object in [js/app.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/app.js):

```javascript
const state = {
  currentStep: 1,
  currentTab: 'proposal_design',
  inputs: {
    projectName: 'CSP Cloud Production-West',
    openstackDistro: 'kolla',
    openstackVersion: '2026.1',
    // ... sizing and networking parameters
  }
};
```

### A. State Synchronization Flow
Whenever a form control receives an input or selection change:
1. **Event Interception**: The UI event listener extracts the input ID and updates `state.inputs[id]`.
2. **Dynamic Options Evaluation**: If the distribution changes, `updateVersionOptions()` repopulates the available release versions.
3. **Sizing Engine execution**: Sizing calculators (`calculateCompute`, `calculateCeph`, `calculateNetwork`) run in sequence.
4. **Topology Re-rendering**: The logical topology generator recreates the SVG layout matching the updated node counts.
5. **Template generation**: Code outputs, HLDs, and low-level templates are re-compiled dynamically.
6. **UI Refresh**: Sub-panels, text labels, compliance checks, and warning logs update the DOM.

---

## 3. Dynamic SVG Topology Dashboard

The physical and logical system architecture is visualized dynamically in the bottom panel using vector graphics (SVG) generated programmatically inside `generateLiveTopologySVG(inputs, calculations)`.

```
                    +--------------------+
                    |  Keystone/Neutron  |
                    |   (Control Path)   |
                    +---------+----------+
                              |
                     [Control vLAN 10]
                              |
                    +---------+----------+
                    |    Compute Node    |
                    |   (Hypervisor)     |
                    +---------+----------+
                              |
                     [Logical Tunnel] (Geneve/VXLAN)
                              |
                    +---------+----------+
                    |     Ceph Node      |
                    |   (Storage OSD)    |
                    +--------------------+
```

* **Control Path Lines**: Drawn as bezier paths connecting controllers to hypervisors.
* **Storage Data Paths**: Visualizes dedicated replication links between active OSDs.
* **Active Overlay Tunnels**: Automatically shifts coloring and protocol names (Geneve vs. VXLAN) based on the active network configuration.
