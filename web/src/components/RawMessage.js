import React, { useState, useMemo, useEffect } from 'react';

function TreeNode(props) {
    const { depth, node } = props;

    return (
        <>
        {(() => {
                const items = [];
                Object.entries(node).map(([key, value]) => {
                    if (value instanceof Object) {
                        items.push(<div key={key.toString()+depth} style={{color:'blue', position:'relative', left: depth * 10}}>{key}</div>);
                        items.push(<TreeNode key={key.toString()+depth+'node'} depth={depth+1} node={value} />);
                    } else {
                        items.push(<div key={key.toString() + depth} style={{position:'relative', left: depth * 10}}>
                            <span style={{color: 'blue'}}>{key}: </span>
                            <span style={{color: 'red'}}>{value.toString()}</span></div>);
                    }
                });
                return <div>{items}</div>;
        })()}
        </>
    );
}

export function TreeView(props) {
    const { node } = props;

    return (
        <div style={{position: 'relative', overflow: 'scroll', fontSize: "0.5rem"}}>
            <TreeNode depth={0} node={node}></TreeNode>
        </div>
    );
}


export function RawMessageView(props) {
    const {
        messageBroker, // MessageBroker
    } = props;
    const [state, setState] = useState({});

    useEffect(() => {
        const callback = (data) => {
            setState(data);
        };
        messageBroker.on(callback);

        return () => {
            messageBroker.off(callback);
        };
    }, [messageBroker]);

    return useMemo(() => {
        return (
            <TreeView node={state} />
        );
    }, [state]);
}
